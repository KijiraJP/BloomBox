const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");
const { deductStock } = require("../utils/inventory");

router.post("/test-deduct", authenticateToken, async (req, res) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({
        message: "Product ID and quantity are required."
      });
    }

    const result = await deductStock(
      Number(product_id),
      Number(quantity)
    );

    return res.status(200).json({
      message: "Stock deducted successfully.",
      ...result
    });

  } catch (error) {
    console.error("Inventory deduction error:", error);

    return res.status(400).json({
      message: error.message
    });
  }
});

module.exports = router;