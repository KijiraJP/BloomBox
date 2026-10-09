const express = require("express");
const router = express.Router();

const authenticateToken = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notificationController");

router.get(
  "/",
  authenticateToken,
  notificationController.listNotifications
);

router.get(
  "/unread-count",
  authenticateToken,
  notificationController.unreadCount
);

router.put(
  "/read-all",
  authenticateToken,
  notificationController.markAllAsRead
);

router.delete(
  "/",
  authenticateToken,
  notificationController.clearNotifications
);

router.put(
  "/:id/read",
  authenticateToken,
  notificationController.markAsRead
);

module.exports = router;
