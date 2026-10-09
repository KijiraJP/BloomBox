const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// Get all active products (with live stock levels)
router.get("/", (req, res) => {
  const sql = `
    SELECT
      p.product_id,
      p.product_name,
      p.product_image,
      p.description,
      p.price,
      p.category,
      p.status,
      COALESCE(ps.stock_quantity, 0) AS stock_quantity
    FROM products p
    LEFT JOIN product_stock ps
      ON ps.product_id = p.product_id
    WHERE p.status = 'active'
    ORDER BY p.product_id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching products:", err);
      return res.status(500).json({
        message: "Failed to fetch products"
      });
    }

    res.json(results);
  });
});

// Add a new product (admin only)
router.post("/", authenticateToken, authorizeRoles("admin"), (req, res) => {
  const {
    product_name,
    product_image,
    description,
    price,
    category
  } = req.body;

  const sql = `
    INSERT INTO products
    (product_name, product_image, description, price, category)
    VALUES (?, ?, ?, ?, ?)
  `;

  const values = [
    product_name,
    product_image || null,
    description || null,
    price,
    category
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error adding product:", err);
      return res.status(500).json({
        message: "Failed to add product"
      });
    }

    const productId = result.insertId;

    // Every product needs a stock row so cart/checkout stock checks work.
    // New products start at 0 until inventory is added.
    db.query(
      "INSERT INTO product_stock (product_id, stock_quantity) VALUES (?, 0)",
      [productId],
      (stockErr) => {
        if (stockErr) {
          console.error("Error creating stock row:", stockErr);
        }

        res.status(201).json({
          message: "Product added successfully",
          product_id: productId
        });
      }
    );
  });
});

// Delete a product (admin only)
router.delete("/:id", authenticateToken, authorizeRoles("admin"), (req, res) => {
  const productId = req.params.id;

  const sql = `
    DELETE FROM products
    WHERE product_id = ?
  `;

  db.query(sql, [productId], (err, result) => {
    if (err) {
      console.error("Error deleting product:", err);
      return res.status(500).json({
        message: "Failed to delete product"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    res.json({
      message: "Product deleted successfully"
    });
  });
});

module.exports = router;