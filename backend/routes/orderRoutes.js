const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

// Completed order history for the logged-in customer only.
router.get("/history", authenticateToken, (req, res) => {
  const historySql = `
    SELECT
      o.order_id,
      o.total_amount,
      o.order_status,
      o.created_at,
      d.delivery_date,
      d.delivery_time,
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

// Create an order from ready-made products and/or custom bouquets. A custom
// bouquet remains one order item, but its individual flower slots are checked
// together with ordinary products before checkout is allowed.
router.post("/", authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const addressId = Number(req.body.address_id);
  if (!Number.isInteger(addressId) || addressId <= 0) return res.status(400).json({ message: "Address ID is required." });

  const connection = db.promise();
  let inTransaction = false;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [addresses] = await connection.query(`SELECT address_id FROM addresses WHERE address_id = ? AND user_id = ? LIMIT 1`, [addressId, userId]);
    if (!addresses[0]) {
      await connection.rollback();
      return res.status(404).json({ message: "Address not found." });
    }
    const [carts] = await connection.query(`SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1 FOR UPDATE`, [userId]);
    if (!carts[0]) {
      await connection.rollback();
      return res.status(404).json({ message: "Cart not found." });
    }
    const cartId = carts[0].cart_id;
    const [cartItems] = await connection.query(
      `SELECT ci.cart_item_id, ci.item_type, ci.product_id, ci.custom_bouquet_id,
        ci.quantity, ci.unit_price, ci.size, p.product_name, cb.bouquet_size_code
       FROM cart_items ci
       LEFT JOIN products p ON p.product_id = ci.product_id
       LEFT JOIN custom_bouquets cb ON cb.custom_bouquet_id = ci.custom_bouquet_id AND cb.user_id = ?
       WHERE ci.cart_id = ? ORDER BY ci.cart_item_id ASC FOR UPDATE`,
      [userId, cartId]
    );
    if (!cartItems.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Cart is empty." });
    }
    const invalidBouquet = cartItems.find((item) => item.item_type === "custom_bouquet" && !item.bouquet_size_code);
    if (invalidBouquet) {
      await connection.rollback();
      return res.status(409).json({ message: "A custom bouquet in your cart is no longer available." });
    }

    const [requirements] = await connection.query(
      `SELECT required_flowers.product_id, p.product_name,
        SUM(required_flowers.required_quantity) AS requested_quantity,
        COALESCE(ps.stock_quantity, 0) AS stock_quantity
       FROM (
         SELECT ci.product_id, ci.quantity AS required_quantity
         FROM cart_items ci WHERE ci.cart_id = ? AND ci.item_type = 'product'
         UNION ALL
         SELECT cbs.product_id, 1 AS required_quantity
         FROM cart_items ci
         INNER JOIN custom_bouquet_slots cbs ON cbs.custom_bouquet_id = ci.custom_bouquet_id
         WHERE ci.cart_id = ? AND ci.item_type = 'custom_bouquet'
       ) required_flowers
       INNER JOIN products p ON p.product_id = required_flowers.product_id AND p.status = 'active'
       LEFT JOIN product_stock ps ON ps.product_id = required_flowers.product_id
       GROUP BY required_flowers.product_id, p.product_name, ps.stock_quantity FOR UPDATE`,
      [cartId, cartId]
    );
    const insufficient = requirements.filter((item) => Number(item.requested_quantity) > Number(item.stock_quantity));
    if (insufficient.length) {
      await connection.rollback();
      return res.status(409).json({ message: `Insufficient stock for: ${insufficient.map((item) => `${item.product_name} (available: ${item.stock_quantity})`).join(", ")}. Please update your cart before checkout.` });
    }

    let totalAmount = 0;
    const orderItems = cartItems.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const subtotal = quantity * unitPrice;
      totalAmount += subtotal;
      return {
        ...item,
        quantity,
        unitPrice,
        subtotal,
        productName: item.item_type === "custom_bouquet" ? `Custom Bouquet — ${item.bouquet_size_code}` : item.product_name
      };
    });

    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, address_id, order_status, total_amount) VALUES (?, ?, 'pending', ?)`,
      [userId, addressId, totalAmount.toFixed(2)]
    );
    const orderId = orderResult.insertId;
    const values = orderItems.map((item) => [
      orderId, item.cart_item_id, item.item_type, item.product_id || null,
      item.custom_bouquet_id || null, item.productName, item.quantity,
      item.unitPrice, item.size || item.bouquet_size_code || null, item.subtotal
    ]);
    await connection.query(
      `INSERT INTO order_items
       (order_id, cart_item_id, item_type, product_id, custom_bouquet_id, product_name, quantity, unit_price, size, subtotal)
       VALUES ?`,
      [values]
    );
    await connection.query(
      `UPDATE custom_bouquets cb
       INNER JOIN cart_items ci ON ci.custom_bouquet_id = cb.custom_bouquet_id
       SET cb.bouquet_status = 'ordered'
       WHERE ci.cart_id = ? AND ci.item_type = 'custom_bouquet'`,
      [cartId]
    );
    await connection.commit();
    return res.status(201).json({ message: "Order created successfully.", order_id: orderId, user_id: userId, address_id: addressId, order_status: "pending", total_amount: totalAmount.toFixed(2) });
  } catch (error) {
    console.error("Error creating order:", error);
    if (inTransaction) await connection.rollback();
    return res.status(500).json({ message: "Failed to create order." });
  }
});

module.exports = router;
