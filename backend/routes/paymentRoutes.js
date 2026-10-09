const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const { notifyUser, notifyRole } = require("../utils/notifications");

// Admins get an alert when a paid order leaves stock at or below this level.
const LOW_STOCK_THRESHOLD = 5;

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

            processSuccessfulPayment();
          }
        );
      } else {
        updateNonSuccessfulPayment();
      }

      // ---------------------------------------------------------
      // NON-SUCCESSFUL PAYMENT
      // ---------------------------------------------------------
      function updateNonSuccessfulPayment() {
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
              console.error(
                "Error updating payment:",
                err
              );

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
              transaction_reference:
                transaction_reference || null
            });
          }
        );
      }

      // ---------------------------------------------------------
      // SUCCESSFUL PAYMENT + INVENTORY + ORDER CONFIRMATION
      // ---------------------------------------------------------
      function processSuccessfulPayment() {
        // Collected during deduction, notified only after the transaction
        // commits so admins never see alerts for rolled-back sales.
        const lowStockItems = [];

        db.beginTransaction((transactionError) => {
          if (transactionError) {
            console.error(
              "Error starting payment transaction:",
              transactionError
            );

            return res.status(500).json({
              message: "Failed to start payment transaction."
            });
          }

          // Get every product in the order and lock its inventory row.
          const orderItemsSql = `
            SELECT
              oi.product_id,
              oi.quantity,
              p.product_name,
              ps.stock_id,
              ps.stock_quantity
            FROM order_items oi
            INNER JOIN products p
              ON oi.product_id = p.product_id
            INNER JOIN product_stock ps
              ON oi.product_id = ps.product_id
            WHERE oi.order_id = ?
            FOR UPDATE
          `;

          db.query(
            orderItemsSql,
            [payment.order_id],
            (itemsError, orderItems) => {
              if (itemsError) {
                console.error(
                  "Error checking order inventory:",
                  itemsError
                );

                return db.rollback(() => {
                  res.status(500).json({
                    message:
                      "Failed to check inventory."
                  });
                });
              }

              if (orderItems.length === 0) {
                return db.rollback(() => {
                  res.status(400).json({
                    message:
                      "No order items were found."
                  });
                });
              }

              // Check every item BEFORE deducting anything.
              for (const item of orderItems) {
                const availableStock =
                  Number(item.stock_quantity);

                const requestedQuantity =
                  Number(item.quantity);

                if (availableStock < requestedQuantity) {
                  return db.rollback(() => {
                    res.status(400).json({
                      message:
                        `Insufficient stock for ${item.product_name}. ` +
                        `Available: ${availableStock}. ` +
                        `Requested: ${requestedQuantity}.`
                    });
                  });
                }
              }

              // All items have enough stock.
              // Now deduct every item.
              deductOrderInventory(
                orderItems,
                lowStockItems,
                (deductError) => {
                  if (deductError) {
                    console.error(
                      "Error deducting inventory:",
                      deductError
                    );

                    return db.rollback(() => {
                      res.status(500).json({
                        message:
                          "Payment could not be completed because inventory could not be updated."
                      });
                    });
                  }

                  // Mark payment successful.
                  const updatePaymentSql = `
                    UPDATE payments
                    SET
                      payment_status = 'successful',
                      transaction_reference = ?,
                      payment_date = CURRENT_TIMESTAMP
                    WHERE payment_id = ?
                  `;

                  db.query(
                    updatePaymentSql,
                    [
                      transaction_reference || null,
                      paymentId
                    ],
                    (paymentError, paymentResult) => {
                      if (paymentError) {
                        console.error(
                          "Error updating successful payment:",
                          paymentError
                        );

                        return db.rollback(() => {
                          res.status(500).json({
                            message:
                              "Payment could not be completed."
                          });
                        });
                      }

                      if (
                        paymentResult.affectedRows === 0
                      ) {
                        return db.rollback(() => {
                          res.status(404).json({
                            message:
                              "Payment not found."
                          });
                        });
                      }

                      // Confirm the order.
                      const confirmOrderSql = `
                        UPDATE orders
                        SET order_status = 'confirmed'
                        WHERE order_id = ?
                          AND order_status = 'pending'
                      `;

                      db.query(
                        confirmOrderSql,
                        [payment.order_id],
                        (orderError, orderResult) => {
                          if (orderError) {
                            console.error(
                              "Error confirming order:",
                              orderError
                            );

                            return db.rollback(() => {
                              res.status(500).json({
                                message:
                                  "Payment could not be completed because the order could not be confirmed."
                              });
                            });
                          }

                          if (
                            orderResult.affectedRows === 0
                          ) {
                            return db.rollback(() => {
                              res.status(400).json({
                                message:
                                  "Order could not be confirmed."
                              });
                            });
                          }

                          clearPaidCartItems(
                            payment.order_id,
                            (clearCartError) => {
                              if (clearCartError) {
                                console.error(
                                  "Error clearing paid cart items:",
                                  clearCartError
                                );

                                return db.rollback(() => {
                                  res.status(500).json({
                                    message:
                                      "Payment could not be completed because the cart could not be updated."
                                  });
                                });
                              }

                              // Inventory, payment, order, and cart all succeeded.
                              db.commit((commitError) => {
                                if (commitError) {
                                  console.error(
                                    "Error committing payment transaction:",
                                    commitError
                                  );

                                  return db.rollback(() => {
                                    res.status(500).json({
                                      message:
                                        "Payment transaction could not be completed."
                                    });
                                  });
                                }

                                notifyUser(userId, {
                                  type: "payment",
                                  order_id: payment.order_id,
                                  title: "Payment successful",
                                  message: `Payment for order #${payment.order_id} was confirmed. Your order is now being prepared.`
                                });

                                notifyRole("admin", {
                                  type: "payment",
                                  order_id: payment.order_id,
                                  title: "Payment received",
                                  message: `Order #${payment.order_id} was paid successfully (${transaction_reference || "reference not set"}).`
                                });

                                lowStockItems.forEach((item) => {
                                  notifyRole("admin", {
                                    type: "stock",
                                    title: "Low stock alert",
                                    message: `${item.product_name} is down to ${item.remaining} unit(s) in stock after order #${payment.order_id}.`
                                  });
                                });

                                return res.status(200).json({
                                  message:
                                    "Payment status updated successfully.",
                                  payment_id:
                                    Number(paymentId),
                                  order_id:
                                    payment.order_id,
                                  attempt_number:
                                    payment.attempt_number,
                                  payment_status:
                                    "successful",
                                  transaction_reference:
                                    transaction_reference ||
                                    null,
                                  order_status:
                                    "confirmed"
                                });
                              });
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        });
      }

      // Deduct inventory for every item in the order.
      function deductOrderInventory(
        orderItems,
        lowStockItems,
        callback
      ) {
        let index = 0;

        function deductNextItem() {
          if (index >= orderItems.length) {
            return callback(null);
          }

          const item = orderItems[index];

          const updateStockSql = `
            UPDATE product_stock
            SET stock_quantity = stock_quantity - ?
            WHERE stock_id = ?
          `;

          db.query(
            updateStockSql,
            [
              Number(item.quantity),
              item.stock_id
            ],
            (error, result) => {
              if (error) {
                return callback(error);
              }

              if (result.affectedRows === 0) {
                return callback(
                  new Error(
                    `Stock could not be updated for ${item.product_name}.`
                  )
                );
              }

              const remaining =
                Number(item.stock_quantity) - Number(item.quantity);

              if (remaining <= LOW_STOCK_THRESHOLD) {
                lowStockItems.push({
                  product_name: item.product_name,
                  remaining: remaining
                });
              }

              index += 1;
              deductNextItem();
            }
          );
        }

        deductNextItem();
      }

      // Remove only cart items copied into this paid order. Items added later
      // remain in the customer's cart.
      function clearPaidCartItems(orderId, callback) {
        const clearCartSql = `
          DELETE ci
          FROM cart_items ci
          INNER JOIN order_items oi
            ON oi.cart_item_id = ci.cart_item_id
          WHERE oi.order_id = ?
        `;

        db.query(clearCartSql, [orderId], callback);
      }
    }
  );
});

module.exports = router;
