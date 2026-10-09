const db = require("../config/db");

// mysql2 returns DATE columns as JS Date objects. Keep them readable.
function formatDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 5);
  }

  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Fire-and-forget insert. Notifications must never break the business
// transaction that triggered them, so failures are only logged.
function insertNotification(userId, notification) {
  if (!userId) {
    return;
  }

  const sql = `
    INSERT INTO notifications
    (
      user_id,
      order_id,
      delivery_id,
      notification_type,
      title,
      message
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      userId,
      notification.order_id || null,
      notification.delivery_id || null,
      notification.type || null,
      notification.title,
      notification.message
    ],
    (error) => {
      if (error) {
        console.error("Failed to create notification:", error);
      }
    }
  );
}

// Notify a single user.
function notifyUser(userId, notification) {
  insertNotification(userId, notification);
}

// Notify every active user that holds a given role (admin, rider, customer).
function notifyRole(role, notification) {
  const sql = `
    SELECT user_id
    FROM users
    WHERE role = ?
      AND account_status = 'active'
  `;

  db.query(sql, [role], (error, users) => {
    if (error) {
      console.error("Failed to load recipients for notification:", error);
      return;
    }

    users.forEach((user) => insertNotification(user.user_id, notification));
  });
}

module.exports = {
  notifyUser,
  notifyRole,
  formatDate,
  formatTime
};
