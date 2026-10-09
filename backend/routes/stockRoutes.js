const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// Check stock availability for a specific product
router.get("/check/:productId", (req, res) => {
  const productId = req.params.productId;
  const requestedQuantity = Number(req.query.quantity || 1);

  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return res.status(400).json({
      message: "Quantity must be a positive whole number."
    });
  }

  const sql = `
    SELECT
      p.product_id,
      p.product_name,
      p.status,
      COALESCE(ps.stock_quantity, 0) AS stock_quantity
    FROM products p
    LEFT JOIN product_stock ps
      ON p.product_id = ps.product_id
    WHERE p.product_id = ?
    LIMIT 1
  `;

  db.query(sql, [productId], (err, results) => {
    if (err) {
      console.error("Error checking product stock:", err);

      return res.status(500).json({
        message: "Failed to check product stock"
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    const product = results[0];
    const stockQuantity = Number(product.stock_quantity);

    const available =
      product.status === "active" &&
      stockQuantity >= requestedQuantity;

    return res.json({
      product_id: product.product_id,
      product_name: product.product_name,
      status: product.status,
      stock_quantity: stockQuantity,
      requested_quantity: requestedQuantity,
      available: available
    });
  });
});

// Add stock for a product (admin only)
router.post("/", authenticateToken, authorizeRoles("admin"), (req, res) => {
  const { product_id, stock_quantity } = req.body;

  if (!product_id || stock_quantity === undefined) {
    return res.status(400).json({
      message: "Product ID and stock quantity are required"
    });
  }

  const sql = `
    INSERT INTO product_stock
    (product_id, stock_quantity)
    VALUES (?, ?)
  `;

  db.query(sql, [product_id, stock_quantity], (err, result) => {
    if (err) {
      console.error("Error adding product stock:", err);
      return res.status(500).json({
        message: "Failed to add product stock"
      });
    }

    res.status(201).json({
      message: "Product stock added successfully",
      stock_id: result.insertId
    });
  });
});

// Update stock quantity (admin only)
router.put("/:id", authenticateToken, authorizeRoles("admin"), (req, res) => {
  const stockId = req.params.id;
  const { stock_quantity } = req.body;

  if (stock_quantity === undefined) {
    return res.status(400).json({
      message: "Stock quantity is required"
    });
  }

  const sql = `
    UPDATE product_stock
    SET stock_quantity = ?
    WHERE stock_id = ?
  `;

  db.query(sql, [stock_quantity, stockId], (err, result) => {
    if (err) {
      console.error("Error updating product stock:", err);
      return res.status(500).json({
        message: "Failed to update product stock"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Stock record not found"
      });
    }

    res.json({
      message: "Product stock updated successfully"
    });
  });
});

// Delete stock record (admin only)
router.delete("/:id", authenticateToken, authorizeRoles("admin"), (req, res) => {
  const stockId = req.params.id;

  const sql = `
    DELETE FROM product_stock
    WHERE stock_id = ?
  `;

  db.query(sql, [stockId], (err, result) => {
    if (err) {
      console.error("Error deleting product stock:", err);
      return res.status(500).json({
        message: "Failed to delete product stock"
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Stock record not found"
      });
    }

    res.json({
      message: "Product stock deleted successfully"
    });
  });
});

module.exports = router;