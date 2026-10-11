const express = require("express");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
  "/customer-test",
  authenticateToken,
  authorizeRoles("customer"),
  (req, res) => {
    res.status(200).json({
      message: "Customer access granted.",
      user: req.user
    });
  }
);

router.get(
  "/rider-test",
  authenticateToken,
  authorizeRoles("rider"),
  (req, res) => {
    res.status(200).json({
      message: "Rider access granted.",
      user: req.user
    });
  }
);

router.get(
  "/admin-test",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    res.status(200).json({
      message: "Admin access granted.",
      user: req.user
    });
  }
);

module.exports = router;