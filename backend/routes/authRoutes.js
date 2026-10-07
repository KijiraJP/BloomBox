const express = require("express");

const {
  registerCustomer,
  login,
  googleLogin,
  googleRiderLogin,
  getMe,
  getAdminTest
} = require("../controllers/authController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/register", registerCustomer);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/google/rider", googleRiderLogin);

router.get("/me", authenticateToken, getMe);

router.get(
  "/admin-test",
  authenticateToken,
  authorizeRoles("admin"),
  getAdminTest
);

module.exports = router;