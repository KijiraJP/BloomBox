const db = require("../config/db");

const createOrder = async (req, res) => {
  const connection = await db.promise().getConnection();

  try {
    const userId = req.user.user_id;
    const { address_id } = req.body;

    if (!address_id) {
      return res.status(400).json({
        message: "Address ID is required."
      });
    }

    // Make sure the address belongs to the logged-in customer
    const [addresses] = await connection.query(
      `SELECT
        address_id,
        user_id,
        street,
        barangay,
        city,
        postal_code,
        landmark
       FROM addresses
       WHERE address_id = ?
       AND user_id = ?
       LIMIT 1`,
      [address_id, userId]
    );

    if (addresses.length === 0) {
      return res.status(403).json({
        message: "The selected address does not belong to this account."
      });
    }

    // Find the customer's cart
    const [carts] = await connection.query(
      `SELECT cart_id
       FROM carts
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (carts.length === 0) {
      return res.status(400).json({
        message: "Cart not found."
      });
    }

    const cartId = carts[0].cart_id;

    // Get cart items together with the current product information
    const [cartItems] = await connection.query(
      `SELECT
        ci.cart_item_id,
        ci.product_id,
        ci.quantity,
        ci.size,
        p.product_name,
        p.price,
        p.status
       FROM cart_items ci
       INNER JOIN products p
         ON ci.product_id = p.product_id
       WHERE ci.cart_id = ?`,
      [cartId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({
        message: "Your cart is empty."
      });
    }

    // Make sure all products are still active
    const unavailableProduct = cartItems.find(
      (item) => item.status !== "active"
    );

    if (unavailableProduct) {
      return res.status(400).json({
        message: `Product "${unavailableProduct.product_name}" is no longer available.`
      });
    }

    // Calculate the order total from the database
    let totalAmount = 0;

    const orderItems = cartItems.map((item) => {
      const unitPrice = Number(item.price);
      const quantity = Number(item.quantity);
      const subtotal = unitPrice * quantity;

      totalAmount += subtotal;

      return {
        product_id: item.product_id,
        product_name: item.product_name,
        quantity,
        unit_price: unitPrice,
        size: item.size,
        subtotal
      };
    });

    await connection.beginTransaction();

    // Create the order
    const [orderResult] = await connection.query(
      `INSERT INTO orders
      (
        user_id,
        address_id,
        order_status,
        total_amount
      )
      VALUES (?, ?, 'pending', ?)`,
      [
        userId,
        address_id,
        totalAmount
      ]
    );

    const orderId = orderResult.insertId;

    // Create the order items
    for (const item of orderItems) {
      await connection.query(
        `INSERT INTO order_items
        (
          order_id,
          product_id,
          product_name,
          quantity,
          unit_price,
          size,
          subtotal
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.size,
          item.subtotal
        ]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: "Order created successfully.",
      order: {
        order_id: orderId,
        user_id: userId,
        address_id,
        order_status: "pending",
        total_amount: totalAmount,
        items: orderItems
      }
    });

  } catch (error) {
    await connection.rollback();

    console.error("Create order error:", error);

    return res.status(500).json({
      message: "Server error while creating order."
    });

  } finally {
    connection.release();
  }
};

module.exports = {
  createOrder
};