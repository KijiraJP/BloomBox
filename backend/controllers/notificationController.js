const db = require("../config/db");

// GET /api/notifications
// Latest notifications for the logged-in user, newest first.
const listNotifications = (req, res) => {
  const sql = `
    SELECT
      n.notification_id,
      n.order_id,
      n.delivery_id,
      n.notification_type,
      n.title,
      n.message,
      n.is_read,
      n.created_at
    FROM notifications n
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC, n.notification_id DESC
    LIMIT 50
  `;

  db.query(sql, [req.user.user_id], (error, notifications) => {
    if (error) {
      console.error("Error fetching notifications:", error);
      return res.status(500).json({ message: "Unable to load notifications." });
    }

    const unreadCount = notifications.filter(
      (item) => Number(item.is_read) === 0
    ).length;

    return res.status(200).json({ notifications, unread_count: unreadCount });
  });
};

// GET /api/notifications/unread-count
// Lightweight poll for the bell badge.
const unreadCount = (req, res) => {
  const sql = `
    SELECT COUNT(*) AS unread_count
    FROM notifications
    WHERE user_id = ?
      AND is_read = 0
  `;

  db.query(sql, [req.user.user_id], (error, results) => {
    if (error) {
      console.error("Error counting notifications:", error);
      return res.status(500).json({ message: "Unable to count notifications." });
    }

    return res.status(200).json({
      unread_count: Number(results[0].unread_count)
    });
  });
};

// PUT /api/notifications/:id/read
const markAsRead = (req, res) => {
  const notificationId = Number(req.params.id);

  if (!notificationId) {
    return res.status(400).json({ message: "Notification ID is required." });
  }

  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE notification_id = ?
      AND user_id = ?
  `;

  db.query(sql, [notificationId, req.user.user_id], (error, result) => {
    if (error) {
      console.error("Error marking notification read:", error);
      return res.status(500).json({ message: "Unable to update notification." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Notification not found." });
    }

    return res.status(200).json({
      message: "Notification marked as read.",
      notification_id: notificationId
    });
  });
};

// PUT /api/notifications/read-all
const markAllAsRead = (req, res) => {
  const sql = `
    UPDATE notifications
    SET is_read = 1
    WHERE user_id = ?
      AND is_read = 0
  `;

  db.query(sql, [req.user.user_id], (error, result) => {
    if (error) {
      console.error("Error marking notifications read:", error);
      return res.status(500).json({ message: "Unable to update notifications." });
    }

    return res.status(200).json({
      message: "All notifications marked as read.",
      updated: result.affectedRows
    });
  });
};

// DELETE /api/notifications
// Remove every notification belonging to the logged-in user.
const clearNotifications = (req, res) => {
  const sql = `
    DELETE FROM notifications
    WHERE user_id = ?
  `;

  db.query(sql, [req.user.user_id], (error, result) => {
    if (error) {
      console.error("Error clearing notifications:", error);
      return res.status(500).json({ message: "Unable to clear notifications." });
    }

    return res.status(200).json({
      message: "Notifications cleared.",
      deleted: result.affectedRows
    });
  });
};

module.exports = {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  clearNotifications
};
