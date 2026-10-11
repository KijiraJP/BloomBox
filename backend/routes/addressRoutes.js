const express = require("express");

const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");
const {
  createAddress
} = require("../controllers/addressController");

router.post(
  "/",
  authenticateToken,
  createAddress
);

module.exports = router;