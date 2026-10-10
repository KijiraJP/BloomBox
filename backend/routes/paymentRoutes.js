const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const { notifyUser } = require("../utils/notifications");
const { completeSuccessfulPayment } = require("../utils/paymentCompletion");
const { createInvoice, getInvoice } = require("../utils/xendit");

// Create a payment attempt
router.post("/", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const { order_id, payment_method } = req.body;

  // Validate required fields
  if (!order_id || !payment_method) {
    return res.status(400).json({
      message: "Order ID and payment method are required."
    });
  }

  // Validate payment method
  const allowedMethods = [
    "gcash",
    "maya",
    "credit_card",
    "debit_card",
    "cod"
  ];

  if (!allowedMethods.includes(payment_method)) {
    return res.status(400).json({
      message: "Invalid payment method."
    });
  }

  // Step 1: Find the order and make sure it belongs to this customer
  const orderSql = `
    SELECT
      order_id,
      user_id,
      total_amount,
      order_status
    FROM orders
    WHERE order_id = ?
      AND user_id = ?
    LIMIT 1
  `;

  db.query(
    orderSql,
    [order_id, userId],
    (err, orderResults) => {
      if (err) {
        console.error("Error finding order:", err);

        return res.status(500).json({
          message: "Failed to find order."
        });
      }

      if (orderResults.length === 0) {
        return res.status(404).json({
          message: "Order not found."
        });
      }

      const order = orderResults[0];

      // Step 2: Make sure the order can still be paid
      if (
        order.order_status === "cancelled" ||
        order.order_status === "delivered"
      ) {
        return res.status(400).json({
          message: "This order cannot be paid."
        });
      }

      // Step 3: Find the customer's previous payment attempts
      const attemptSql = `
        SELECT
          COALESCE(MAX(attempt_number), 0) AS last_attempt
        FROM payments
        WHERE order_id = ?
      `;

      db.query(
        attemptSql,
        [order_id],
        (err, attemptResults) => {
          if (err) {
            console.error("Error checking payment attempts:", err);

            return res.status(500).json({
              message: "Failed to check payment attempts."
            });
          }

          const nextAttempt =
            Number(attemptResults[0].last_attempt) + 1;

          // Step 4: Create a pending payment attempt
          const paymentSql = `
            INSERT INTO payments
            (
              order_id,
              attempt_number,
              payment_method,
              amount,
              payment_status
            )
            VALUES (?, ?, ?, ?, 'pending')
          `;

          db.query(
            paymentSql,
            [
              order_id,
              nextAttempt,
              payment_method,
              order.total_amount
            ],
            (err, paymentResult) => {
              if (err) {
                console.error("Error creating payment:", err);

                return res.status(500).json({
                  message: "Failed to create payment."
                });
              }

              return res.status(201).json({
                message: "Payment attempt created successfully.",
                payment_id: paymentResult.insertId,
                order_id: Number(order_id),
                attempt_number: nextAttempt,
                payment_method: payment_method,
                amount: Number(order.total_amount),
                payment_status: "pending"
              });
            }
          );
        }
      );
    }
  );
});

// Update the status of a payment attempt
router.put("/:id/status", authenticateToken, (req, res) => {
  const paymentId = req.params.id;
  const userId = req.user.user_id;
  const { payment_status, transaction_reference } = req.body;

  // Validate payment status
  const allowedStatuses = [
    "pending",
    "successful",
    "failed",
    "cancelled"
  ];

  if (!allowedStatuses.includes(payment_status)) {
    return res.status(400).json({
      message: "Invalid payment status."
    });
  }

  // Find the payment and make sure it belongs
  // to an order owned by the logged-in customer
  const paymentSql = `
    SELECT
      p.payment_id,
      p.order_id,
      p.attempt_number,
      p.payment_status,
      p.amount,
      o.user_id,
      o.order_status
    FROM payments p
    INNER JOIN orders o
      ON p.order_id = o.order_id
    WHERE p.payment_id = ?
      AND o.user_id = ?
    LIMIT 1
  `;

  db.query(
    paymentSql,
    [paymentId, userId],
    (err, paymentResults) => {
      if (err) {
        console.error("Error finding payment:", err);

        return res.status(500).json({
          message: "Failed to find payment."
        });
      }

      if (paymentResults.length === 0) {
        return res.status(404).json({
          message: "Payment not found."
        });
      }

      const payment = paymentResults[0];

      // Do not allow a completed payment to be changed
      if (
        payment.payment_status === "successful" ||
        payment.payment_status === "cancelled"
      ) {
        return res.status(400).json({
          message: "This payment can no longer be modified."
        });
      }

      // Successful payment requires inventory + payment + order
      // to be completed inside one database transaction.
      if (payment_status === "successful") {
        const successfulSql = `
          SELECT payment_id
          FROM payments
          WHERE order_id = ?
            AND payment_status = 'successful'
          LIMIT 1
        `;

        db.query(
          successfulSql,
          [payment.order_id],
          (err, successfulResults) => {
            if (err) {
              console.error(
                "Error checking successful payment:",
                err
              );

              return res.status(500).json({
                message: "Failed to check payment status."
              });
            }

            if (successfulResults.length > 0) {
              return res.status(400).json({
                message: "This order has already been paid successfully."
              });
            }

            completeSuccessfulPayment(
              {
                paymentId: paymentId,
                orderId: payment.order_id,
                userId: userId,
                transactionReference: transaction_reference
              },
              (completionError, result) => {
                if (completionError) {
                  return res
                    .status(completionError.status || 500)
                    .json({ message: completionError.message });
                }

                return res.status(200).json({
                  message: "Payment status updated successfully.",
                  payment_id: Number(paymentId),
                  order_id: result.order_id,
                  attempt_number: payment.attempt_number,
                  payment_status: "successful",
                  transaction_reference: result.transaction_reference,
                  order_status: "confirmed"
                });
              }
            );
          }
        );
        return;
      }

      // Non-successful payment (failed / cancelled)
      const updateSql = `
        UPDATE payments
        SET
          payment_status = ?,
          transaction_reference = ?,
          payment_date = CASE
            WHEN ? = 'successful'
            THEN CURRENT_TIMESTAMP
            ELSE payment_date
          END
        WHERE payment_id = ?
      `;

      db.query(
        updateSql,
        [
          payment_status,
          transaction_reference || null,
          payment_status,
          paymentId
        ],
        (err, result) => {
          if (err) {
            console.error("Error updating payment:", err);

            return res.status(500).json({
              message: "Failed to update payment."
            });
          }

          if (result.affectedRows === 0) {
            return res.status(404).json({
              message: "Payment not found."
            });
          }

          if (payment_status === "failed") {
            notifyUser(userId, {
              type: "payment",
              order_id: payment.order_id,
              title: "Payment failed",
              message:
                `Payment attempt #${payment.attempt_number} for order #${payment.order_id} failed. ` +
                `Your order is still pending - you can try again from checkout.`
            });
          }

          return res.status(200).json({
            message: "Payment status updated successfully.",
            payment_id: Number(paymentId),
            order_id: payment.order_id,
            attempt_number: payment.attempt_number,
            payment_status: payment_status,
            transaction_reference: transaction_reference || null
          });
        }
      );
    }
  );
});

// Create a hosted Xendit invoice for an online payment attempt.
// The customer completes payment on the returned checkout_url.
router.post("/:id/xendit/invoice", authenticateToken, (req, res) => {
  const paymentId = req.params.id;
  const userId = req.user.user_id;

  const paymentSql = `
    SELECT
      p.payment_id,
      p.order_id,
      p.attempt_number,
      p.amount,
      p.payment_method,
      p.payment_status,
      o.order_status,
      u.email
    FROM payments p
    INNER JOIN orders o
      ON p.order_id = o.order_id
    INNER JOIN users u
      ON o.user_id = u.user_id
    WHERE p.payment_id = ?
      AND o.user_id = ?
    LIMIT 1
  `;

  db.query(paymentSql, [paymentId, userId], (err, results) => {
    if (err) {
      console.error("Error finding payment for invoice:", err);

      return res.status(500).json({
        message: "Failed to find payment."
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Payment not found."
      });
    }

    const payment = results[0];

    if (payment.payment_status === "successful") {
      return res.status(400).json({
        message: "This payment has already been completed."
      });
    }

    if (payment.payment_status === "cancelled") {
      return res.status(400).json({
        message: "This payment can no longer be modified."
      });
    }

    if (payment.payment_method === "cod") {
      return res.status(400).json({
        message: "Cash on Delivery does not use the online gateway."
      });
    }

    // One invoice per order + payment attempt keeps external_id unique,
    // so a retry always produces a fresh invoice.
    const externalId =
      `bloombox_order_${payment.order_id}` +
      `_payment_${payment.payment_id}` +
      `_attempt_${payment.attempt_number}`;

    createInvoice({
      externalId: externalId,
      amount: payment.amount,
      payerEmail: payment.email,
      description: `BloomBox order #${payment.order_id}`
    })
      .then((invoice) => {
        const updateSql = `
          UPDATE payments
          SET
            gateway = 'xendit',
            gateway_invoice_id = ?,
            gateway_checkout_url = ?,
            gateway_status = ?
          WHERE payment_id = ?
        `;

        db.query(
          updateSql,
          [invoice.id, invoice.invoice_url, invoice.status, paymentId],
          (updateError) => {
            if (updateError) {
              console.error(
                "Error saving Xendit invoice details:",
                updateError
              );

              return res.status(500).json({
                message: "Failed to save the payment invoice."
              });
            }

            return res.status(201).json({
              message: "Xendit invoice created.",
              payment_id: Number(paymentId),
              order_id: payment.order_id,
              attempt_number: payment.attempt_number,
              invoice_id: invoice.id,
              gateway_invoice_id: invoice.id,
              checkout_url: invoice.invoice_url,
              gateway_status: invoice.status,
              payment_status: payment.payment_status
            });
          }
        );
      })
      .catch((invoiceError) => {
        console.error("Failed to create Xendit invoice:", invoiceError);

        return res
          .status(invoiceError.statusCode === 401 ? 401 : 502)
          .json({
            message: "Could not create the payment invoice with Xendit."
          });
      });
  });
});

// Verify a Xendit invoice server-side and complete the payment if it was paid.
// This avoids needing a public webhook URL for local development.
router.post("/:id/xendit/verify", authenticateToken, (req, res) => {
  const paymentId = req.params.id;
  const userId = req.user.user_id;

  const paymentSql = `
    SELECT
      p.payment_id,
      p.order_id,
      p.payment_status,
      p.gateway,
      p.gateway_invoice_id
    FROM payments p
    INNER JOIN orders o
      ON p.order_id = o.order_id
    WHERE p.payment_id = ?
      AND o.user_id = ?
    LIMIT 1
  `;

  db.query(paymentSql, [paymentId, userId], (err, results) => {
    if (err) {
      console.error("Error finding payment for verification:", err);

      return res.status(500).json({
        message: "Failed to find payment."
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Payment not found."
      });
    }

    const payment = results[0];

    if (payment.payment_status === "successful") {
      return res.status(200).json({
        message: "Payment already verified.",
        payment_id: Number(paymentId),
        order_id: payment.order_id,
        payment_status: "successful",
        order_status: "confirmed"
      });
    }

    if (!payment.gateway_invoice_id) {
      return res.status(400).json({
        message: "No Xendit invoice is associated with this payment."
      });
    }

    getInvoice(payment.gateway_invoice_id)
      .then((invoice) => {
        const gatewayStatus = invoice.status;

        // Remember the latest gateway status for display/diagnostics.
        db.query(
          "UPDATE payments SET gateway_status = ? WHERE payment_id = ?",
          [gatewayStatus, paymentId],
          (updateError) => {
            if (updateError) {
              console.error(
                "Error updating gateway status:",
                updateError
              );
            }
          }
        );

        if (gatewayStatus === "PAID" || gatewayStatus === "SETTLED") {
          completeSuccessfulPayment(
            {
              paymentId: paymentId,
              orderId: payment.order_id,
              userId: userId,
              transactionReference: invoice.id
            },
            (completionError, result) => {
              if (completionError) {
                return res
                  .status(completionError.status || 500)
                  .json({ message: completionError.message });
              }

              return res.status(200).json({
                message: "Payment verified successfully.",
                payment_id: Number(paymentId),
                order_id: result.order_id,
                payment_status: "successful",
                transaction_reference: result.transaction_reference,
                order_status: "confirmed"
              });
            }
          );
          return;
        }

        // Not paid yet (PENDING / EXPIRED / others) - report the current state.
        return res.status(200).json({
          message:
            gatewayStatus === "EXPIRED"
              ? "The payment invoice has expired."
              : "Payment is still pending.",
          payment_id: Number(paymentId),
          order_id: payment.order_id,
          payment_status: payment.payment_status,
          gateway_status: gatewayStatus
        });
      })
      .catch((invoiceError) => {
        console.error("Failed to fetch Xendit invoice:", invoiceError);

        return res.status(502).json({
          message: "Could not check the payment status with Xendit."
        });
      });
  });
});

module.exports = router;
