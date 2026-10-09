const express = require("express");

const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const { notifyUser } = require("../utils/notifications");

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
        ci.product_id,
        p.product_name,
        p.product_image,
        p.category,
        ci.quantity,
        ci.unit_price,
        ci.size,
        ci.wrap_style,
        ci.gift_message,
        COALESCE(ps.stock_quantity, 0) AS stock_quantity,
        ci.created_at,
        ci.updated_at
      FROM cart_items ci
      INNER JOIN products p
        ON ci.product_id = p.product_id
      LEFT JOIN product_stock ps
        ON ps.product_id = ci.product_id
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

// Add a product to the logged-in customer's cart.
// The cart row is created automatically on first add so new customers can
// shop without a separate setup step.
router.post("/items", authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const { product_id, quantity, size, wrap_style, gift_message } = req.body;

  // Validate required fields
  if (!product_id || quantity === undefined) {
    return res.status(400).json({
      message: "Product ID and quantity are required."
    });
  }

  const requestedQuantity = Number(quantity);

  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return res.status(400).json({
      message: "Quantity must be a positive whole number."
    });
  }

  const cleanWrapStyle = wrap_style
    ? String(wrap_style).slice(0, 50)
    : null;
  const cleanGiftMessage = gift_message
    ? String(gift_message).slice(0, 255)
    : null;

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

    if (cartResults.length > 0) {
      return continueWithCart(cartResults[0].cart_id);
    }

    // First-time shopper: create the cart, then continue.
    db.query(
      "INSERT INTO carts (user_id) VALUES (?)",
      [userId],
      (createErr, createResult) => {
        if (createErr) {
          console.error("Error creating cart:", createErr);

          return res.status(500).json({
            message: "Failed to create cart"
          });
        }

        return continueWithCart(createResult.insertId);
      }
    );
  });

  function continueWithCart(cartId) {
    // Get the product, its current price, and its stock level
    const productSql = `
      SELECT
        p.product_id,
        p.product_name,
        p.price,
        p.status,
        COALESCE(ps.stock_quantity, 0) AS stock_quantity
      FROM products p
      LEFT JOIN product_stock ps
        ON ps.product_id = p.product_id
      WHERE p.product_id = ?
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

      const stockQuantity = Number(product.stock_quantity);

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
              existingItem.quantity + requestedQuantity;

            if (newQuantity > stockQuantity) {
              return res.status(409).json({
                message:
                  stockQuantity <= 0
                    ? `${product.product_name} is out of stock.`
                    : `Only ${stockQuantity} left in stock for ${product.product_name}.`
              });
            }

            const updateSql = `
              UPDATE cart_items
              SET quantity = ?,
                  wrap_style = ?,
                  gift_message = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE cart_item_id = ?
            `;

            db.query(
              updateSql,
              [
                newQuantity,
                cleanWrapStyle,
                cleanGiftMessage,
                existingItem.cart_item_id
              ],
              (err) => {
                if (err) {
                  console.error("Error updating cart item:", err);

                  return res.status(500).json({
                    message: "Failed to update cart item"
                  });
                }

                notifyUser(userId, {
                  type: "cart",
                  title: "Added to your bag",
                  message: `${requestedQuantity} × ${product.product_name} was added to your bag (now ${newQuantity}).`
                });

                return res.status(200).json({
                  message: "Cart item quantity updated successfully.",
                  cart_item_id: existingItem.cart_item_id,
                  quantity: newQuantity
                });
              }
            );

            return;
          }

          if (requestedQuantity > stockQuantity) {
            return res.status(409).json({
              message:
                stockQuantity <= 0
                  ? `${product.product_name} is out of stock.`
                  : `Only ${stockQuantity} left in stock for ${product.product_name}.`
            });
          }

          // Product/size doesn't exist → create new cart item
          const insertSql = `
            INSERT INTO cart_items
            (
              cart_id,
              product_id,
              quantity,
              unit_price,
              size,
              wrap_style,
              gift_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          db.query(
            insertSql,
            [
              cartId,
              product_id,
              requestedQuantity,
              unitPrice,
              size || null,
              cleanWrapStyle,
              cleanGiftMessage
            ],
            (err, result) => {
              if (err) {
                console.error("Error adding cart item:", err);

                return res.status(500).json({
                  message: "Failed to add item to cart"
                });
              }

              notifyUser(userId, {
                type: "cart",
                title: "Added to your bag",
                message: `${requestedQuantity} × ${product.product_name} was added to your bag.`
              });

              return res.status(201).json({
                message: "Product added to cart successfully.",
                cart_item_id: result.insertId,
                cart_id: cartId,
                product_id: product_id,
                quantity: requestedQuantity,
                unit_price: unitPrice,
                size: size || null,
                wrap_style: cleanWrapStyle,
                gift_message: cleanGiftMessage
              });
            }
          );
        }
      );
    });
  }
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

  const requestedQuantity = Number(quantity);

  // Load the cart item together with its stock level so the customer
  // cannot add more than what is actually available.
  const itemSql = `
    SELECT
      ci.cart_item_id,
      ci.quantity,
      p.product_name,
      COALESCE(ps.stock_quantity, 0) AS stock_quantity
    FROM cart_items ci
    INNER JOIN carts c
      ON ci.cart_id = c.cart_id
    INNER JOIN products p
      ON p.product_id = ci.product_id
    LEFT JOIN product_stock ps
      ON ps.product_id = ci.product_id
    WHERE ci.cart_item_id = ?
      AND c.user_id = ?
    LIMIT 1
  `;

  db.query(itemSql, [cartItemId, userId], (err, itemResults) => {
    if (err) {
      console.error("Error loading cart item:", err);

      return res.status(500).json({
        message: "Failed to load cart item"
      });
    }

    if (itemResults.length === 0) {
      return res.status(404).json({
        message: "Cart item not found."
      });
    }

    const cartItem = itemResults[0];
    const stockQuantity = Number(cartItem.stock_quantity);

    if (requestedQuantity > stockQuantity) {
      return res.status(409).json({
        message:
          stockQuantity <= 0
            ? `${cartItem.product_name} is out of stock.`
            : `Only ${stockQuantity} left in stock for ${cartItem.product_name}.`
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
    `;

    db.query(
      sql,
      [requestedQuantity, cartItemId, userId],
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
          quantity: requestedQuantity
        });
      }
    );
  });
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

  // Delete only if the cart item belongs to the logged-in customer
  const sql = `
    DELETE ci
    FROM cart_items ci
    INNER JOIN carts c
      ON ci.cart_id = c.cart_id
    WHERE
      ci.cart_item_id = ?
      AND c.user_id = ?
  `;

  db.query(
    sql,
    [cartItemId, userId],
    (err, result) => {
      if (err) {
        console.error("Error deleting cart item:", err);

        return res.status(500).json({
          message: "Failed to delete cart item"
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Cart item not found."
        });
      }

      return res.status(200).json({
        message: "Cart item deleted successfully.",
        cart_item_id: Number(cartItemId)
      });
    }
  );
});

module.exports = router;
