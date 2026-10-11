import React, { useEffect, useRef, useState } from "react";
import "./notifications.css";

const API_BASE = "http://localhost:5000/api/notifications";

function timeAgo(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function fullTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function BellIcon({ size = 20, filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const TYPE_PATHS = {
  order: (
    <>
      <path d="M6 8h12l1 12H5L6 8z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  payment: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M2.5 10.5h19" />
      <path d="M6 15h4" />
    </>
  ),
  delivery: (
    <>
      <path d="M2.5 6.5h11v10h-11z" />
      <path d="M13.5 10h3.6l3.4 3.4v3.1h-7z" />
      <circle cx="7" cy="18.5" r="1.8" />
      <circle cx="17" cy="18.5" r="1.8" />
    </>
  ),
  assignment: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  cart: (
    <>
      <path d="M6 8h12l-1.2 9H7.2L6 8z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="15.5" cy="20" r="1.2" />
    </>
  ),
  stock: (
    <>
      <path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" />
      <path d="M4.2 7.4L12 11.5l7.8-4.1" />
      <path d="M12 11.5V21" />
    </>
  )
};

function TypeIcon({ type }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TYPE_PATHS[type] || <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
      <path d="M6.4 7l.9 12.2a.8.8 0 0 0 .8.8h7.8a.8.8 0 0 0 .8-.8L18 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const load = async () => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch(API_BASE, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error("Notifications unavailable:", error);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (notification) => {
    if (Number(notification.is_read) === 1) {
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.notification_id === notification.notification_id
          ? { ...item, is_read: 1 }
          : item
      )
    );
    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      await fetch(`${API_BASE}/${notification.notification_id}/read`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`
        }
      });
    } catch (error) {
      console.error("Unable to mark notification read:", error);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: 1 }))
    );
    setUnreadCount(0);

    try {
      await fetch(`${API_BASE}/read-all`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`
        }
      });
    } catch (error) {
      console.error("Unable to mark notifications read:", error);
    }
  };

  const clearAll = async () => {
    setNotifications([]);
    setUnreadCount(0);

    try {
      await fetch(API_BASE, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`
        }
      });
    } catch (error) {
      console.error("Unable to clear notifications:", error);
      load();
    }
  };

  return (
    <div className="notif-bell" ref={containerRef}>
      <button
        type="button"
        className="notif-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
      >
        <BellIcon filled={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <div className="notif-heading">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <span className="notif-count">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="notif-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-markall"
                  onClick={markAllAsRead}
                >
                  <CheckIcon /> Mark all read
                </button>
              )}

              {notifications.length > 0 && (
                <button
                  type="button"
                  className="notif-clear"
                  onClick={clearAll}
                  title="Clear all notifications"
                  aria-label="Clear all notifications"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <span className="notif-empty-icon">
                  <BellIcon size={24} />
                </span>
                <strong>You&apos;re all caught up</strong>
                <p>Order, payment, delivery, bag and stock updates will appear here.</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isUnread = Number(item.is_read) === 0;
                const type = TYPE_PATHS[item.notification_type]
                  ? item.notification_type
                  : "default";

                return (
                  <button
                    type="button"
                    key={item.notification_id}
                    className={`notif-item ${isUnread ? "unread" : ""}`}
                    onClick={() => markAsRead(item)}
                  >
                    <span className={`notif-icon notif-icon--${type}`}>
                      <TypeIcon type={type} />
                    </span>

                    <span className="notif-text">
                      <span className="notif-title-row">
                        <strong className="notif-title">{item.title}</strong>
                        {isUnread && <span className="notif-tag">New</span>}
                      </span>

                      <span className="notif-message">{item.message}</span>

                      <span className="notif-meta">
                        <time title={fullTimestamp(item.created_at)}>
                          {timeAgo(item.created_at)}
                        </time>
                        {item.order_id && <span>Order #{item.order_id}</span>}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notif-footer">
              {unreadCount === 0
                ? "You're all caught up"
                : "Click a notification to mark it as read"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
