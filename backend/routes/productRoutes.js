const express = require("express");
const router = express.Router();

const db = require("../config/db");

// Get all active products
router.get("/", (req, res) => {
  const sql = `
    SELECT
      product_id,
      product_name,
      product_image,
      description,
      price,
      category,
      status
    FROM products
    WHERE status = 'active'
    ORDER BY product_id DESC
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

// Add a new product
router.post("/", (req, res) => {
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

    res.status(201).json({
      message: "Product added successfully",
      product_id: result.insertId
    });
  });
});

// Delete a product
router.delete("/:id", (req, res) => {
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