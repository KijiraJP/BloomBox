const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const { notifyUser, notifyRole } = require("../utils/notifications");

// Completed order history for the logged-in customer only.
router.get("/history", authenticateToken, (req, res) => {
  const historySql = `
    SELECT
      o.order_id,
      o.total_amount,
      o.order_status,
      o.created_at,
      DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
      TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
      d.delivery_status,
      p.payment_method,
      p.payment_status,
      p.transaction_reference,
      GROUP_CONCAT(
        CONCAT(oi.quantity, ' × ', oi.product_name)
        ORDER BY oi.order_item_id ASC SEPARATOR ' • '
      ) AS items
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.order_id
    LEFT JOIN deliveries d ON d.order_id = o.order_id
    LEFT JOIN payments p ON p.payment_id = (
      SELECT p2.payment_id
      FROM payments p2
      WHERE p2.order_id = o.order_id
      ORDER BY (p2.payment_status = 'successful') DESC, p2.payment_id DESC
      LIMIT 1
    )
    WHERE o.user_id = ?
      AND o.order_status = 'delivered'
    GROUP BY
      o.order_id, o.total_amount, o.order_status, o.created_at,
      d.delivery_date, d.delivery_time, d.delivery_status,
      p.payment_method, p.payment_status, p.transaction_reference
    ORDER BY o.updated_at DESC, o.order_id DESC
  `;

  db.query(historySql, [req.user.user_id], (error, orders) => {
    if (error) {
      console.error("Error fetching customer order history:", error);
      return res.status(500).json({ message: "Unable to load completed orders." });
    }

    return res.status(200).json({ orders });
  });
});

// Create an order from the customer's cart
router.post("/", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const { address_id } = req.body;

  // Validate address_id
  if (!address_id) {
    return res.status(400).json({
      message: "Address ID is required."
    });
  }

  // Step 1: Verify that the address belongs to the logged-in customer
  const addressSql = `
    SELECT address_id
    FROM addresses
    WHERE address_id = ?
      AND user_id = ?
    LIMIT 1
  `;

  db.query(
    addressSql,
    [address_id, userId],
    (err, addressResults) => {
      if (err) {
        console.error("Error checking address:", err);

        return res.status(500).json({
          message: "Failed to verify address."
        });
      }

      if (addressResults.length === 0) {
        return res.status(404).json({
          message: "Address not found."
        });
      }

      // Step 2: Find the customer's cart
      const cartSql = `
        SELECT cart_id
        FROM carts
        WHERE user_id = ?
        LIMIT 1
      `;

      db.query(cartSql, [userId], (err, cartResults) => {
        if (err) {
          console.error("Error finding cart:", err);

          return res.status(500).json({
            message: "Failed to find cart."
          });
        }

        if (cartResults.length === 0) {
          return res.status(404).json({
            message: "Cart not found."
          });
        }

        const cartId = cartResults[0].cart_id;

        // Step 3: Get all items in the customer's cart
          const itemsSql = `
          SELECT
            ci.cart_item_id,
            ci.product_id,
            p.product_name,
            ci.quantity,
            ci.unit_price,
            ci.size,
            ci.wrap_style,
            ci.gift_message,
            COALESCE(ps.stock_quantity, 0) AS stock_quantity
          FROM cart_items ci
          INNER JOIN products p
            ON ci.product_id = p.product_id
          LEFT JOIN product_stock ps
            ON ps.product_id = ci.product_id
          WHERE ci.cart_id = ?
          ORDER BY ci.cart_item_id ASC
        `;

        db.query(itemsSql, [cartId], (err, cartItems) => {
          if (err) {
            console.error("Error finding cart items:", err);

            return res.status(500).json({
              message: "Failed to find cart items."
            });
          }

          if (cartItems.length === 0) {
            return res.status(400).json({
              message: "Cart is empty."
            });
          }

          // Stop checkout early when stock is unavailable. Final payment/COD
          // stock locking remains in place to protect against concurrent orders.
          const requestedByProduct = new Map();
          cartItems.forEach((item) => {
            const existing = requestedByProduct.get(item.product_id) || {
              product_name: item.product_name,
              requested_quantity: 0,
              stock_quantity: Number(item.stock_quantity)
            };
            existing.requested_quantity += Number(item.quantity);
            requestedByProduct.set(item.product_id, existing);
          });

          const insufficientItems = [...requestedByProduct.values()].filter(
            (item) => item.requested_quantity > item.stock_quantity
          );

          if (insufficientItems.length > 0) {
            const unavailableProducts = insufficientItems
              .map((item) => `${item.product_name} (available: ${item.stock_quantity})`)
              .join(", ");

            return res.status(409).json({
              message: `Insufficient stock for: ${unavailableProducts}. Please update your cart before checkout.`
            });
          }

          // Step 4: Calculate each item's subtotal and the order total
          let totalAmount = 0;

          const orderItemValues = cartItems.map((item) => {
            const quantity = Number(item.quantity);
            const unitPrice = Number(item.unit_price);
            const subtotal = quantity * unitPrice;

            totalAmount += subtotal;

            return [
              item.cart_item_id,
              item.product_id,
              item.product_name,
              quantity,
              unitPrice,
              item.size,
              item.wrap_style,
              item.gift_message,
              subtotal
            ];
          });

          // Step 5: Create the order
          const orderSql = `
            INSERT INTO orders
            (
              user_id,
              address_id,
              order_status,
              total_amount
            )
            VALUES (?, ?, 'pending', ?)
          `;

          db.query(
            orderSql,
            [userId, address_id, totalAmount.toFixed(2)],
            (err, orderResult) => {
              if (err) {
                console.error("Error creating order:", err);

                return res.status(500).json({
                  message: "Failed to create order."
                });
              }

              const orderId = orderResult.insertId;

              // Step 6: Create the order items
              const orderItemsSql = `
                INSERT INTO order_items
                (
                  order_id,
                  cart_item_id,
                  product_id,
                  product_name,
                  quantity,
                  unit_price,
                  size,
                  wrap_style,
                  gift_message,
                  subtotal
                )
                VALUES ?
              `;

              const values = orderItemValues.map((item) => [
                orderId,
                ...item
              ]);

              db.query(
                orderItemsSql,
                [values],
                (err) => {
                  if (err) {
                    console.error("Error creating order items:", err);

                    return res.status(500).json({
                      message:
                        "Order was created, but order items could not be created."
                    });
                  }

                  // Step 7: Tell the customer and the admin team
                  notifyUser(userId, {
                    type: "order",
                    order_id: orderId,
                    title: "Order received",
                    message: `Order #${orderId} was created for ₱${totalAmount.toFixed(2)}. Complete your payment to confirm it.`
                  });

                  notifyRole("admin", {
                    type: "order",
                    order_id: orderId,
                    title: "New order placed",
                    message: `Order #${orderId} (₱${totalAmount.toFixed(2)}) is waiting for payment.`
                  });

                  // Step 8: Return the newly created order
                  return res.status(201).json({
                    message: "Order created successfully.",
                    order_id: orderId,
                    user_id: userId,
                    address_id: Number(address_id),
                    order_status: "pending",
                    total_amount: totalAmount.toFixed(2)
                  });
                }
              );
            }
          );
        });
      });
    }
  );
});

module.exports = router;
