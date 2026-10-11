const express = require("express");

const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

// Get the logged-in customer's cart
router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.user_id;

  // First, find the cart belonging to this user
  const cartSql = `
    SELECT
      cart_id,
      user_id,
      created_at,
      updated_at
    FROM carts
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(cartSql, [userId], (err, cartResults) => {
    if (err) {
      console.error("Error fetching cart:", err);

      return res.status(500).json({
        message: "Failed to fetch cart"
      });
    }

    // Customer does not have a cart yet
    if (cartResults.length === 0) {
      return res.status(200).json({
        cart_id: null,
        user_id: userId,
        items: [],
        subtotal: "0.00",
        total: "0.00"
      });
    }

    const cart = cartResults[0];

    // Find the items inside the cart
    const itemsSql = `
      SELECT
        ci.cart_item_id,
        ci.cart_id,
        ci.item_type,
        ci.product_id,
        ci.custom_bouquet_id,
        CASE WHEN ci.item_type = 'custom_bouquet'
          THEN CONCAT('Custom Bouquet — ', COALESCE(bso.display_name, 'Custom'))
          ELSE p.product_name END AS product_name,
        CASE WHEN ci.item_type = 'custom_bouquet' THEN (
          SELECT preview_product.product_image
          FROM custom_bouquet_slots preview_slot
          INNER JOIN products preview_product ON preview_product.product_id = preview_slot.product_id
          WHERE preview_slot.custom_bouquet_id = ci.custom_bouquet_id
          ORDER BY preview_slot.slot_number ASC LIMIT 1
        ) ELSE p.product_image END AS product_image,
        ci.quantity,
        ci.unit_price,
        COALESCE(ci.size, cb.bouquet_size_code) AS size,
        cb.theme_color,
        cb.personalized_message,
        (SELECT GROUP_CONCAT(CONCAT(slot_product.product_name, ' × ', grouped.quantity) ORDER BY slot_product.product_name SEPARATOR ' • ')
         FROM (SELECT product_id, COUNT(*) AS quantity FROM custom_bouquet_slots
               WHERE custom_bouquet_id = ci.custom_bouquet_id GROUP BY product_id) grouped
         INNER JOIN products slot_product ON slot_product.product_id = grouped.product_id
        ) AS custom_flower_summary,
        ci.created_at,
        ci.updated_at
      FROM cart_items ci
      LEFT JOIN products p
        ON ci.product_id = p.product_id
      LEFT JOIN custom_bouquets cb ON cb.custom_bouquet_id = ci.custom_bouquet_id
      LEFT JOIN bouquet_size_options bso ON bso.size_code = cb.bouquet_size_code
      WHERE ci.cart_id = ?
      ORDER BY ci.cart_item_id ASC
    `;

    db.query(itemsSql, [cart.cart_id], (err, itemResults) => {
      if (err) {
        console.error("Error fetching cart items:", err);

        return res.status(500).json({
          message: "Failed to fetch cart items"
        });
      }

      // Calculate subtotal for every cart item
      const items = itemResults.map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price);

        const subtotal = quantity * unitPrice;

        return {
          ...item,
          unit_price: unitPrice.toFixed(2),
          subtotal: subtotal.toFixed(2)
        };
      });

      // Calculate the entire cart subtotal
      const cartSubtotal = items.reduce((total, item) => {
        return total + Number(item.subtotal);
      }, 0);

      return res.status(200).json({
        cart_id: cart.cart_id,
        user_id: cart.user_id,
        created_at: cart.created_at,
        updated_at: cart.updated_at,
        items: items,
        subtotal: cartSubtotal.toFixed(2),
        total: cartSubtotal.toFixed(2)
      });
    });
  });
});

// Create a cart for the logged-in customer
router.post("/", authenticateToken, (req, res) => {
  const userId = req.user.user_id;

  // Check whether the customer already has a cart
  const checkCartSql = `
    SELECT cart_id
    FROM carts
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(checkCartSql, [userId], (err, cartResults) => {
    if (err) {
      console.error("Error checking cart:", err);

      return res.status(500).json({
        message: "Failed to check cart"
      });
    }

    // Cart already exists
    if (cartResults.length > 0) {
      return res.status(200).json({
        message: "Cart already exists.",
        cart_id: cartResults[0].cart_id
      });
    }

    // Create a new cart
    const createCartSql = `
      INSERT INTO carts (user_id)
      VALUES (?)
    `;

    db.query(createCartSql, [userId], (err, result) => {
      if (err) {
        console.error("Error creating cart:", err);

        return res.status(500).json({
          message: "Failed to create cart"
        });
      }

      return res.status(201).json({
        message: "Cart created successfully.",
        cart_id: result.insertId
      });
    });
  });
});

// Add a completed custom bouquet draft as one cart item. Its flower instances
// remain saved in custom_bouquet_slots and are checked again at checkout.
router.post("/custom-bouquets", authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const customBouquetId = Number(req.body.custom_bouquet_id);
  if (!Number.isInteger(customBouquetId) || customBouquetId <= 0) {
    return res.status(400).json({ message: "A valid custom bouquet is required." });
  }

  const connection = db.promise();
  let inTransaction = false;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const [bouquets] = await connection.query(
      `SELECT custom_bouquet_id, bouquet_status, bouquet_size_code, total_price
       FROM custom_bouquets
       WHERE custom_bouquet_id = ? AND user_id = ? FOR UPDATE`,
      [customBouquetId, userId]
    );
    const bouquet = bouquets[0];
    if (!bouquet) {
      await connection.rollback();
      return res.status(404).json({ message: "Custom bouquet draft not found." });
    }
    if (bouquet.bouquet_status !== "draft" && bouquet.bouquet_status !== "in_cart") {
      await connection.rollback();
      return res.status(409).json({ message: "This bouquet can no longer be added to the cart." });
    }

    const [requirements] = await connection.query(
      `SELECT cbs.product_id, p.product_name, COUNT(*) AS requested_quantity,
        COALESCE(ps.stock_quantity, 0) AS stock_quantity
       FROM custom_bouquet_slots cbs
       INNER JOIN products p ON p.product_id = cbs.product_id AND p.status = 'active'
       LEFT JOIN product_stock ps ON ps.product_id = cbs.product_id
       WHERE cbs.custom_bouquet_id = ?
       GROUP BY cbs.product_id, p.product_name, ps.stock_quantity FOR UPDATE`,
      [customBouquetId]
    );
    if (!requirements.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Add at least one available flower before adding this bouquet to your cart." });
    }
    const unavailable = requirements.find((item) => Number(item.requested_quantity) > Number(item.stock_quantity));
    if (unavailable) {
      await connection.rollback();
      return res.status(409).json({ message: `${unavailable.product_name} no longer has enough stock for this bouquet.` });
    }

    const [carts] = await connection.query(`SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1 FOR UPDATE`, [userId]);
    let cartId = carts[0]?.cart_id;
    if (!cartId) {
      const [createdCart] = await connection.query(`INSERT INTO carts (user_id) VALUES (?)`, [userId]);
      cartId = createdCart.insertId;
    }
    const [existing] = await connection.query(
      `SELECT cart_item_id FROM cart_items
       WHERE cart_id = ? AND item_type = 'custom_bouquet' AND custom_bouquet_id = ? LIMIT 1`,
      [cartId, customBouquetId]
    );
    if (existing[0]) {
      await connection.rollback();
      return res.status(409).json({ message: "This custom bouquet is already in your cart." });
    }

    const [result] = await connection.query(
      `INSERT INTO cart_items (cart_id, item_type, product_id, custom_bouquet_id, quantity, unit_price, size)
       VALUES (?, 'custom_bouquet', NULL, ?, 1, ?, ?)`,
      [cartId, customBouquetId, bouquet.total_price, bouquet.bouquet_size_code]
    );
    await connection.query(`UPDATE custom_bouquets SET bouquet_status = 'in_cart' WHERE custom_bouquet_id = ?`, [customBouquetId]);
    await connection.commit();
    return res.status(201).json({ message: "Custom bouquet added to your cart.", cart_item_id: result.insertId, custom_bouquet_id: customBouquetId });
  } catch (error) {
    console.error("Error adding custom bouquet to cart:", error);
    if (inTransaction) await connection.rollback();
    return res.status(500).json({ message: "Failed to add custom bouquet to cart." });
  }
});

// Add a product to the logged-in customer's cart
router.post("/items", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const { product_id, quantity, size } = req.body;

  // Validate required fields
  if (!product_id || quantity === undefined) {
    return res.status(400).json({
      message: "Product ID and quantity are required."
    });
  }

  if (quantity <= 0) {
    return res.status(400).json({
      message: "Quantity must be greater than 0."
    });
  }

  // Find the customer's cart
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
        message: "Failed to find cart"
      });
    }

    if (cartResults.length === 0) {
      return res.status(404).json({
        message: "Cart not found. Please create a cart first."
      });
    }

    const cartId = cartResults[0].cart_id;

    // Get the product and its current price
    const productSql = `
      SELECT
        product_id,
        product_name,
        price,
        status
      FROM products
      WHERE product_id = ?
      LIMIT 1
    `;

    db.query(productSql, [product_id], (err, productResults) => {
      if (err) {
        console.error("Error finding product:", err);

        return res.status(500).json({
          message: "Failed to find product"
        });
      }

      if (productResults.length === 0) {
        return res.status(404).json({
          message: "Product not found."
        });
      }

      const product = productResults[0];

      // Only active products can be added to the cart
      if (product.status !== "active") {
        return res.status(400).json({
          message: "This product is not available."
        });
      }

      // Use the price from the database
      const unitPrice = product.price;

      // Check whether this product/size is already in the cart
      const existingItemSql = `
        SELECT cart_item_id, quantity
        FROM cart_items
        WHERE cart_id = ?
          AND product_id = ?
          AND (
            size = ?
            OR (size IS NULL AND ? IS NULL)
          )
        LIMIT 1
      `;

      db.query(
        existingItemSql,
        [cartId, product_id, size || null, size || null],
        (err, existingItems) => {
          if (err) {
            console.error("Error checking cart item:", err);

            return res.status(500).json({
              message: "Failed to check cart item"
            });
          }

          // Product/size already exists → increase quantity
          if (existingItems.length > 0) {
            const existingItem = existingItems[0];

            const newQuantity =
              existingItem.quantity + Number(quantity);

            const updateSql = `
              UPDATE cart_items
              SET quantity = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE cart_item_id = ?
            `;

            db.query(
              updateSql,
              [newQuantity, existingItem.cart_item_id],
              (err) => {
                if (err) {
                  console.error("Error updating cart item:", err);

                  return res.status(500).json({
                    message: "Failed to update cart item"
                  });
                }

                return res.status(200).json({
                  message: "Cart item quantity updated successfully.",
                  cart_item_id: existingItem.cart_item_id,
                  quantity: newQuantity
                });
              }
            );

            return;
          }

          // Product/size doesn't exist → create new cart item
          const insertSql = `
            INSERT INTO cart_items
            (
              cart_id,
              product_id,
              quantity,
              unit_price,
              size
            )
            VALUES (?, ?, ?, ?, ?)
          `;

          db.query(
            insertSql,
            [
              cartId,
              product_id,
              quantity,
              unitPrice,
              size || null
            ],
            (err, result) => {
              if (err) {
                console.error("Error adding cart item:", err);

                return res.status(500).json({
                  message: "Failed to add item to cart"
                });
              }

              return res.status(201).json({
                message: "Product added to cart successfully.",
                cart_item_id: result.insertId,
                cart_id: cartId,
                product_id: product_id,
                quantity: quantity,
                unit_price: unitPrice,
                size: size || null
              });
            }
          );
        }
      );
    });
  });
});

// Update the quantity of a cart item
router.put("/items/:id", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const cartItemId = req.params.id;
  const { quantity } = req.body;

  // Validate quantity
  if (quantity === undefined) {
    return res.status(400).json({
      message: "Quantity is required."
    });
  }

  if (Number(quantity) <= 0) {
    return res.status(400).json({
      message: "Quantity must be greater than 0."
    });
  }

  // Make sure the cart item belongs to the logged-in customer
  const sql = `
    UPDATE cart_items ci
    INNER JOIN carts c
      ON ci.cart_id = c.cart_id
    SET
      ci.quantity = ?,
      ci.updated_at = CURRENT_TIMESTAMP
    WHERE
      ci.cart_item_id = ?
      AND c.user_id = ?
      AND ci.item_type = 'product'
  `;

  db.query(
    sql,
    [Number(quantity), cartItemId, userId],
    (err, result) => {
      if (err) {
        console.error("Error updating cart item quantity:", err);

        return res.status(500).json({
          message: "Failed to update cart item quantity"
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Cart item not found."
        });
      }

      return res.status(200).json({
        message: "Cart item quantity updated successfully.",
        cart_item_id: Number(cartItemId),
        quantity: Number(quantity)
      });
    }
  );
});

// Clear only the cart entries copied into this customer's confirmed COD order.
// Entries added after checkout are left untouched.
router.delete("/order/:orderId", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const orderId = Number(req.params.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "A valid order ID is required." });
  }

  const sql = `
    DELETE ci
    FROM cart_items ci
    INNER JOIN carts c ON c.cart_id = ci.cart_id
    INNER JOIN order_items oi ON oi.cart_item_id = ci.cart_item_id
    INNER JOIN orders o ON o.order_id = oi.order_id
    WHERE oi.order_id = ? AND o.user_id = ? AND c.user_id = ?
  `;

  db.query(sql, [orderId, userId, userId], (err, result) => {
    if (err) {
      console.error("Error clearing checked-out cart items:", err);
      return res.status(500).json({ message: "Unable to clear checked-out cart items." });
    }

    return res.status(200).json({
      message: "Checked-out cart items cleared.",
      cleared_items: result.affectedRows
    });
  });
});

// Delete a cart item
router.delete("/items/:id", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const cartItemId = req.params.id;

  const lookupSql = `
    SELECT ci.item_type, ci.custom_bouquet_id
    FROM cart_items ci
    INNER JOIN carts c ON c.cart_id = ci.cart_id
    WHERE ci.cart_item_id = ? AND c.user_id = ?
    LIMIT 1
  `;

  db.query(lookupSql, [cartItemId, userId], (lookupError, items) => {
    if (lookupError) return res.status(500).json({ message: "Failed to find cart item." });
    if (!items.length) return res.status(404).json({ message: "Cart item not found." });
    const item = items[0];

    db.query(`DELETE FROM cart_items WHERE cart_item_id = ?`, [cartItemId], (err, result) => {
      if (err) {
        console.error("Error deleting cart item:", err);
        return res.status(500).json({ message: "Failed to delete cart item" });
      }
      if (!result.affectedRows) return res.status(404).json({ message: "Cart item not found." });
      if (item.item_type !== "custom_bouquet") {
        return res.status(200).json({ message: "Cart item deleted successfully.", cart_item_id: Number(cartItemId) });
      }

      db.query(
        `UPDATE custom_bouquets SET bouquet_status = 'draft'
         WHERE custom_bouquet_id = ? AND user_id = ? AND bouquet_status = 'in_cart'`,
        [item.custom_bouquet_id, userId],
        (statusError) => {
          if (statusError) return res.status(500).json({ message: "Cart item was removed, but the bouquet could not be reopened." });
          return res.status(200).json({
            message: "Custom bouquet removed and reopened for editing.",
            cart_item_id: Number(cartItemId),
            custom_bouquet_id: Number(item.custom_bouquet_id)
          });
        }
      );
    });
  });
});

module.exports = router;
