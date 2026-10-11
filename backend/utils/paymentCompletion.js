const db = require("../config/db");
const { notifyUser, notifyRole } = require("./notifications");

// Admins get an alert when a paid order leaves stock at or below this level.
const LOW_STOCK_THRESHOLD = 5;

// Complete a successful payment inside one database transaction:
// deduct inventory, mark the payment successful, confirm the order,
// and clear the paid cart items. Notifications are sent only after commit.
//
// Extracted from paymentRoutes so both the manual status route and the
// Xendit invoice verification can run the exact same logic.
function completeSuccessfulPayment(params, callback) {
  const paymentId = params.paymentId;
  const orderId = params.orderId;
  const userId = params.userId;
  const transactionReference = params.transactionReference;

  // Collected during deduction, notified only after the transaction commits
  // so admins never see alerts for rolled-back sales.
  const lowStockItems = [];

  function rollbackWith(message, status) {
    return db.rollback(() => {
      callback({ status: status || 500, message: message });
    });
  }

  // Deduct inventory for every item in the order.
  function deductOrderInventory(orderItems, done) {
    let index = 0;

    function deductNextItem() {
      if (index >= orderItems.length) {
        return done(null);
      }

      const item = orderItems[index];

      const updateStockSql = `
        UPDATE product_stock
        SET stock_quantity = stock_quantity - ?
        WHERE stock_id = ?
      `;

      db.query(
        updateStockSql,
        [Number(item.quantity), item.stock_id],
        (error, result) => {
          if (error) {
            return done(error);
          }

          if (result.affectedRows === 0) {
            return done(
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
  function clearPaidCartItems(orderIdToClear, done) {
    const clearCartSql = `
      DELETE ci
      FROM cart_items ci
      INNER JOIN order_items oi
        ON oi.cart_item_id = ci.cart_item_id
      WHERE oi.order_id = ?
    `;

    db.query(clearCartSql, [orderIdToClear], done);
  }

  db.beginTransaction((transactionError) => {
    if (transactionError) {
      console.error("Error starting payment transaction:", transactionError);

      return callback({
        status: 500,
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

    db.query(orderItemsSql, [orderId], (itemsError, orderItems) => {
      if (itemsError) {
        console.error("Error checking order inventory:", itemsError);

        return rollbackWith("Failed to check inventory.");
      }

      if (orderItems.length === 0) {
        return rollbackWith("No order items were found.", 400);
      }

      // Check every item BEFORE deducting anything.
      for (const item of orderItems) {
        const availableStock = Number(item.stock_quantity);
        const requestedQuantity = Number(item.quantity);

        if (availableStock < requestedQuantity) {
          return rollbackWith(
            `Insufficient stock for ${item.product_name}. ` +
              `Available: ${availableStock}. ` +
              `Requested: ${requestedQuantity}.`,
            400
          );
        }
      }

      // All items have enough stock. Now deduct every item.
      deductOrderInventory(orderItems, (deductError) => {
        if (deductError) {
          console.error("Error deducting inventory:", deductError);

          return rollbackWith(
            "Payment could not be completed because inventory could not be updated."
          );
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
          [transactionReference || null, paymentId],
          (paymentError, paymentResult) => {
            if (paymentError) {
              console.error(
                "Error updating successful payment:",
                paymentError
              );

              return rollbackWith("Payment could not be completed.");
            }

            if (paymentResult.affectedRows === 0) {
              return rollbackWith("Payment not found.", 404);
            }

            // Confirm the order.
            const confirmOrderSql = `
              UPDATE orders
              SET order_status = 'confirmed'
              WHERE order_id = ?
                AND order_status = 'pending'
            `;

            db.query(confirmOrderSql, [orderId], (orderError, orderResult) => {
              if (orderError) {
                console.error("Error confirming order:", orderError);

                return rollbackWith(
                  "Payment could not be completed because the order could not be confirmed."
                );
              }

              if (orderResult.affectedRows === 0) {
                return rollbackWith("Order could not be confirmed.", 400);
              }

              clearPaidCartItems(orderId, (clearCartError) => {
                if (clearCartError) {
                  console.error(
                    "Error clearing paid cart items:",
                    clearCartError
                  );

                  return rollbackWith(
                    "Payment could not be completed because the cart could not be updated."
                  );
                }

                // Inventory, payment, order, and cart all succeeded.
                db.commit((commitError) => {
                  if (commitError) {
                    console.error(
                      "Error committing payment transaction:",
                      commitError
                    );

                    return rollbackWith(
                      "Payment transaction could not be completed."
                    );
                  }

                  notifyUser(userId, {
                    type: "payment",
                    order_id: orderId,
                    title: "Payment successful",
                    message: `Payment for order #${orderId} was confirmed. Your order is now being prepared.`
                  });

                  notifyRole("admin", {
                    type: "payment",
                    order_id: orderId,
                    title: "Payment received",
                    message: `Order #${orderId} was paid successfully (${transactionReference || "reference not set"}).`
                  });

                  lowStockItems.forEach((item) => {
                    notifyRole("admin", {
                      type: "stock",
                      title: "Low stock alert",
                      message: `${item.product_name} is down to ${item.remaining} unit(s) in stock after order #${orderId}.`
                    });
                  });

                  return callback(null, {
                    payment_id: Number(paymentId),
                    order_id: orderId,
                    payment_status: "successful",
                    order_status: "confirmed",
                    transaction_reference: transactionReference || null
                  });
                });
              });
            });
          }
        );
      });
    });
  });
}

module.exports = {
  completeSuccessfulPayment
};
