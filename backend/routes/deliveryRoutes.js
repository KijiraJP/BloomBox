const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const { notifyUser, notifyRole, formatDate, formatTime } = require("../utils/notifications");

// Save the requested delivery schedule for an order owned by the customer.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("customer"),
  (req, res) => {
    const userId = req.user.user_id;
    const { order_id, delivery_date, delivery_time } = req.body;

    if (!order_id || !delivery_date || !delivery_time) {
      return res.status(400).json({
        message: "Order ID, delivery date, and delivery time are required."
      });
    }

    const requestedDate = new Date(`${delivery_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(requestedDate.getTime()) || requestedDate < today) {
      return res.status(400).json({
        message: "The preferred delivery date cannot be in the past."
      });
    }

    const orderSql = `
      SELECT
        o.order_id,
        a.street,
        a.barangay,
        a.city,
        a.postal_code,
        a.landmark
      FROM orders o
      INNER JOIN addresses a
        ON a.address_id = o.address_id
      WHERE o.order_id = ?
        AND o.user_id = ?
      LIMIT 1
    `;

    db.query(orderSql, [order_id, userId], (orderError, orders) => {
      if (orderError) {
        console.error("Error finding delivery order:", orderError);
        return res.status(500).json({ message: "Failed to find order." });
      }

      if (orders.length === 0) {
        return res.status(404).json({
          message: "Order not found."
        });
      }

      const existingDeliverySql = `
        SELECT delivery_id
        FROM deliveries
        WHERE order_id = ?
        LIMIT 1
      `;

      db.query(
        existingDeliverySql,
        [order_id],
        (existingError, deliveries) => {
          if (existingError) {
            console.error("Error checking delivery:", existingError);
            return res.status(500).json({
              message: "Failed to check delivery."
            });
          }

          if (deliveries.length > 0) {
            return res.status(409).json({
              message: "A delivery schedule already exists for this order."
            });
          }

          const order = orders[0];
          const insertDeliverySql = `
            INSERT INTO deliveries
            (
              order_id,
              delivery_date,
              delivery_time,
              street,
              barangay,
              city,
              postal_code,
              landmark
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.query(
            insertDeliverySql,
            [
              order.order_id,
              delivery_date,
              delivery_time,
              order.street,
              order.barangay,
              order.city,
              order.postal_code,
              order.landmark
            ],
            (insertError, result) => {
              if (insertError) {
                console.error("Error creating delivery:", insertError);
                return res.status(500).json({
                  message: "Failed to save delivery schedule."
                });
              }

              notifyUser(userId, {
                type: "delivery",
                order_id: Number(order_id),
                delivery_id: result.insertId,
                title: "Delivery request received",
                message: `Your preferred schedule for order #${order_id} (${formatDate(delivery_date)} at ${formatTime(delivery_time)}) was sent for confirmation.`
              });

              notifyRole("admin", {
                type: "delivery",
                order_id: Number(order_id),
                delivery_id: result.insertId,
                title: "Delivery request awaiting confirmation",
                message: `Order #${order_id} requests delivery on ${formatDate(delivery_date)} at ${formatTime(delivery_time)}. Review and confirm or decline.`
              });

              return res.status(201).json({
                message: "Delivery schedule created successfully.",
                delivery: {
                  delivery_id: result.insertId,
                  order_id: Number(order_id),
                  delivery_date,
                  delivery_time,
                  delivery_status: "pending"
                }
              });
            }
          );
        }
      );
    });
  }
);

// Admin dashboard data: deliveries that do not have an active assignment,
// plus active riders available for assignment.
router.get(
  "/admin/overview",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    const deliveriesSql = `
      SELECT
        d.delivery_id,
        d.order_id,
        DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
        TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
        d.delivery_status,
        d.street,
        d.barangay,
        d.city,
        o.total_amount,
        CONCAT(cu.first_name, ' ', cu.last_name) AS customer_name
      FROM deliveries d
      INNER JOIN orders o ON o.order_id = d.order_id
      INNER JOIN users cu ON cu.user_id = o.user_id
      WHERE d.delivery_status NOT IN ('delivered', 'failed', 'cancelled')
        AND NOT EXISTS (
        SELECT 1
        FROM delivery_assignments da
        WHERE da.delivery_id = d.delivery_id
          AND da.assignment_status IN ('assigned', 'accepted', 'completed')
      )
      ORDER BY d.delivery_date ASC, d.delivery_time ASC
    `;

    const ridersSql = `
      SELECT
        r.rider_id,
        u.first_name,
        u.last_name,
        r.contact_number
      FROM riders r
      INNER JOIN users u ON u.user_id = r.user_id
      WHERE r.rider_status = 'active'
        AND u.account_status = 'active'
      ORDER BY u.first_name, u.last_name
    `;

    db.query(deliveriesSql, (deliveryError, deliveries) => {
      if (deliveryError) {
        console.error("Error fetching admin deliveries:", deliveryError);
        return res.status(500).json({ message: "Failed to fetch deliveries." });
      }

      db.query(ridersSql, (riderError, riders) => {
        if (riderError) {
          console.error("Error fetching active riders:", riderError);
          return res.status(500).json({ message: "Failed to fetch riders." });
        }

        return res.status(200).json({ deliveries, riders });
      });
    });
  }
);

// Admin calendar: every delivered order with the date it was actually
// completed by the rider, used by the Order Calendar tab.
router.get(
  "/admin/calendar",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    const deliveriesSql = `
      SELECT
        d.delivery_id,
        d.order_id,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d') AS delivered_on,
        DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
        TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
        d.delivery_status,
        o.order_status,
        o.total_amount,
        p.payment_method,
        CONCAT(cu.first_name, ' ', cu.last_name) AS customer_name,
        (
          SELECT CONCAT(ru.first_name, ' ', ru.last_name)
          FROM delivery_assignments da
          INNER JOIN riders r ON r.rider_id = da.rider_id
          INNER JOIN users ru ON ru.user_id = r.user_id
          WHERE da.delivery_id = d.delivery_id
            AND da.assignment_status = 'completed'
          ORDER BY da.assignment_id DESC
          LIMIT 1
        ) AS rider_name
      FROM deliveries d
      INNER JOIN orders o ON o.order_id = d.order_id
      INNER JOIN users cu ON cu.user_id = o.user_id
      LEFT JOIN payments p ON p.order_id = o.order_id
      WHERE d.delivery_status = 'delivered'
      ORDER BY DATE(d.updated_at) DESC, d.delivery_time DESC
    `;

    db.query(deliveriesSql, (error, deliveries) => {
      if (error) {
        console.error("Error fetching delivery calendar:", error);
        return res.status(500).json({ message: "Failed to fetch delivery calendar." });
      }

      return res.status(200).json({ deliveries });
    });
  }
);

// Full order details for the admin schedule review modal.
router.get(
  "/admin/:deliveryId",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    const deliveryId = Number(req.params.deliveryId);

    const deliverySql = `
      SELECT
        d.delivery_id,
        d.order_id,
        DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
        TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
        d.delivery_status,
        d.rejection_reason,
        d.street,
        d.barangay,
        d.city,
        d.postal_code,
        d.landmark,
        o.order_status,
        o.total_amount,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') AS placed_at,
        CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
        u.email AS customer_email,
        p.payment_method,
        p.payment_status,
        p.transaction_reference
      FROM deliveries d
      INNER JOIN orders o ON o.order_id = d.order_id
      INNER JOIN users u ON u.user_id = o.user_id
      LEFT JOIN payments p ON p.payment_id = (
        SELECT p2.payment_id
        FROM payments p2
        WHERE p2.order_id = o.order_id
        ORDER BY (p2.payment_status = 'successful') DESC, p2.payment_id DESC
        LIMIT 1
      )
      WHERE d.delivery_id = ?
      LIMIT 1
    `;

    db.query(deliverySql, [deliveryId], (deliveryError, deliveries) => {
      if (deliveryError) {
        console.error("Error fetching delivery details:", deliveryError);
        return res.status(500).json({ message: "Failed to fetch delivery details." });
      }

      if (deliveries.length === 0) {
        return res.status(404).json({ message: "Delivery request not found." });
      }

      const delivery = deliveries[0];

      const itemsSql = `
        SELECT
          product_name,
          quantity,
          size,
          wrap_style,
          gift_message,
          unit_price,
          subtotal
        FROM order_items
        WHERE order_id = ?
        ORDER BY order_item_id ASC
      `;

      db.query(itemsSql, [delivery.order_id], (itemsError, items) => {
        if (itemsError) {
          console.error("Error fetching delivery order items:", itemsError);
          return res.status(500).json({ message: "Failed to fetch order items." });
        }

        return res.status(200).json({ delivery, items });
      });
    });
  }
);

// Admin confirms or declines a customer's preferred delivery schedule.
router.put(
  "/:deliveryId/confirm",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    const deliveryId = Number(req.params.deliveryId);
    const { decision, delivery_date, delivery_time, reason } = req.body;

    if (!["accepted", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "Invalid review decision." });
    }

    if (decision === "rejected" && (!reason || !reason.trim())) {
      return res.status(400).json({
        message: "A reason is required to decline the schedule."
      });
    }

    const findSql = `
      SELECT
        d.delivery_id,
        d.order_id,
        DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
        TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
        d.delivery_status,
        o.user_id AS customer_user_id
      FROM deliveries d
      INNER JOIN orders o ON o.order_id = d.order_id
      WHERE d.delivery_id = ?
      LIMIT 1
    `;

    db.query(findSql, [deliveryId], (findError, rows) => {
      if (findError) {
        console.error("Error reviewing delivery:", findError);
        return res.status(500).json({ message: "Failed to review delivery." });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Delivery request not found." });
      }

      const delivery = rows[0];

      if (delivery.delivery_status !== "pending") {
        return res.status(409).json({
          message: "This delivery request has already been reviewed."
        });
      }

      if (decision === "accepted") {
        const finalDate = (delivery_date || "").trim() || delivery.delivery_date;
        const finalTime = (delivery_time || "").trim() || delivery.delivery_time;

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(finalDate) ||
          !/^\d{2}:\d{2}$/.test(finalTime)
        ) {
          return res.status(400).json({
            message: "A valid delivery date and time are required."
          });
        }

        const acceptSql = `
          UPDATE deliveries
          SET delivery_status = 'confirmed',
              confirmed_at = CURRENT_TIMESTAMP,
              rejection_reason = NULL,
              delivery_date = ?,
              delivery_time = ?
          WHERE delivery_id = ?
            AND delivery_status = 'pending'
        `;

        db.query(acceptSql, [finalDate, finalTime, deliveryId], (acceptError, result) => {
          if (acceptError) {
            console.error("Error confirming delivery:", acceptError);
            return res.status(500).json({ message: "Failed to confirm delivery." });
          }

          if (result.affectedRows === 0) {
            return res.status(409).json({
              message: "This delivery request has already been reviewed."
            });
          }

          notifyUser(delivery.customer_user_id, {
            type: "delivery",
            order_id: delivery.order_id,
            delivery_id: deliveryId,
            title: "Delivery confirmed",
            message: `Your delivery for order #${delivery.order_id} is confirmed for ${formatDate(finalDate)} at ${formatTime(finalTime)}.`
          });

          return res.status(200).json({
            message: "Delivery schedule confirmed.",
            delivery_id: deliveryId,
            delivery_status: "confirmed",
            delivery_date: finalDate,
            delivery_time: finalTime
          });
        });

        return;
      }

      const declineSql = `
        UPDATE deliveries
        SET delivery_status = 'cancelled',
            rejection_reason = ?
        WHERE delivery_id = ?
          AND delivery_status = 'pending'
      `;

      db.query(declineSql, [reason.trim(), deliveryId], (declineError, result) => {
        if (declineError) {
          console.error("Error declining delivery:", declineError);
          return res.status(500).json({ message: "Failed to decline delivery." });
        }

        if (result.affectedRows === 0) {
          return res.status(409).json({
            message: "This delivery request has already been reviewed."
          });
        }

        db.query(
          "UPDATE orders SET order_status = 'cancelled' WHERE order_id = ?",
          [delivery.order_id],
          (orderError) => {
            if (orderError) {
              console.error("Error cancelling order after decline:", orderError);
            }

            notifyUser(delivery.customer_user_id, {
              type: "delivery",
              order_id: delivery.order_id,
              delivery_id: deliveryId,
              title: "Delivery request declined",
              message: `Your preferred schedule for order #${delivery.order_id} was declined: ${reason.trim()}. The order has been cancelled.`
            });

            return res.status(200).json({
              message: "Delivery request declined.",
              delivery_id: deliveryId,
              delivery_status: "cancelled",
              rejection_reason: reason.trim()
            });
          }
        );
      });
    });
  }
);

// Assign one active rider to an unassigned delivery.
router.post(
  "/:deliveryId/assign",
  authenticateToken,
  authorizeRoles("admin"),
  (req, res) => {
    const { rider_id } = req.body;
    const deliveryId = Number(req.params.deliveryId);

    if (!deliveryId || !rider_id) {
      return res.status(400).json({
        message: "Delivery ID and rider ID are required."
      });
    }

    const riderSql = `
      SELECT r.rider_id, u.user_id, u.first_name, u.last_name
      FROM riders r
      INNER JOIN users u ON u.user_id = r.user_id
      WHERE r.rider_id = ?
        AND r.rider_status = 'active'
        AND u.account_status = 'active'
      LIMIT 1
    `;

    db.query(riderSql, [rider_id], (riderError, riders) => {
      if (riderError) {
        console.error("Error checking rider:", riderError);
        return res.status(500).json({ message: "Failed to check rider." });
      }

      if (riders.length === 0) {
        return res.status(404).json({ message: "Active rider not found." });
      }

      const rider = riders[0];

      const deliverySql = `
        SELECT delivery_id, order_id, delivery_date, delivery_time, delivery_status
        FROM deliveries
        WHERE delivery_id = ?
        LIMIT 1
      `;

      db.query(deliverySql, [deliveryId], (deliveryError, deliveries) => {
        if (deliveryError) {
          console.error("Error checking delivery:", deliveryError);
          return res.status(500).json({ message: "Failed to check delivery." });
        }

        if (deliveries.length === 0) {
          return res.status(404).json({ message: "Delivery not found." });
        }

        const delivery = deliveries[0];

        if (delivery.delivery_status !== "confirmed") {
          return res.status(409).json({
            message: "Confirm this delivery schedule before assigning a rider."
          });
        }

        const activeAssignmentSql = `
          SELECT assignment_id
          FROM delivery_assignments
          WHERE delivery_id = ?
            AND assignment_status IN ('assigned', 'accepted')
          LIMIT 1
        `;

        db.query(
          activeAssignmentSql,
          [deliveryId],
          (assignmentError, assignments) => {
            if (assignmentError) {
              console.error("Error checking assignment:", assignmentError);
              return res.status(500).json({ message: "Failed to check assignment." });
            }

            if (assignments.length > 0) {
              return res.status(409).json({
                message: "This delivery already has an active rider assignment."
              });
            }

            const insertSql = `
              INSERT INTO delivery_assignments (delivery_id, rider_id)
              VALUES (?, ?)
            `;

            db.query(insertSql, [deliveryId, rider_id], (insertError, result) => {
              if (insertError) {
                console.error("Error assigning rider:", insertError);
                return res.status(500).json({ message: "Failed to assign rider." });
              }

              notifyUser(rider.user_id, {
                type: "assignment",
                order_id: delivery.order_id,
                delivery_id: deliveryId,
                title: "New delivery assigned",
                message: `Order #${delivery.order_id} is assigned to you on ${formatDate(delivery.delivery_date)} at ${formatTime(delivery.delivery_time)}. Please accept or reject it.`
              });

              const customerSql = `
                SELECT user_id
                FROM orders
                WHERE order_id = ?
                LIMIT 1
              `;

              db.query(customerSql, [delivery.order_id], (customerError, customers) => {
                if (customerError || customers.length === 0) {
                  return;
                }

                notifyUser(customers[0].user_id, {
                  type: "delivery",
                  order_id: delivery.order_id,
                  delivery_id: deliveryId,
                  title: "Rider assigned",
                  message: `${rider.first_name} ${rider.last_name} will deliver order #${delivery.order_id} on ${formatDate(delivery.delivery_date)}.`
                });
              });

              return res.status(201).json({
                message: "Rider assigned successfully.",
                assignment_id: result.insertId,
                delivery_id: deliveryId,
                rider_id: Number(rider_id),
                assignment_status: "assigned"
              });
            });
          }
        );
      });
    });
  }
);

// Rider dashboard data for the currently logged-in rider.
router.get(
  "/rider/assignments",
  authenticateToken,
  authorizeRoles("rider"),
  (req, res) => {
    const assignmentsSql = `
      SELECT
        da.assignment_id,
        da.assignment_status,
        da.rejection_reason,
        d.delivery_id,
        d.order_id,
        DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date,
        TIME_FORMAT(d.delivery_time, '%H:%i') AS delivery_time,
        d.street,
        d.barangay,
        d.city,
        o.total_amount,
        p.payment_method,
        p.payment_status
      FROM delivery_assignments da
      INNER JOIN riders r ON r.rider_id = da.rider_id
      INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
      INNER JOIN orders o ON o.order_id = d.order_id
      LEFT JOIN payments p ON p.order_id = o.order_id
      WHERE r.user_id = ?
      ORDER BY da.assigned_at DESC, da.assignment_id DESC
    `;

    db.query(assignmentsSql, [req.user.user_id], (error, assignments) => {
      if (error) {
        console.error("Error fetching rider assignments:", error);
        return res.status(500).json({ message: "Failed to fetch assignments." });
      }

      return res.status(200).json({ assignments });
    });
  }
);

// Rider accepts or rejects an assignment. Rejection requires an explanation.
router.put(
  "/assignments/:assignmentId/respond",
  authenticateToken,
  authorizeRoles("rider"),
  (req, res) => {
    const assignmentId = Number(req.params.assignmentId);
    const { assignment_status, rejection_reason } = req.body;

    if (!['accepted', 'rejected'].includes(assignment_status)) {
      return res.status(400).json({ message: "Invalid assignment response." });
    }

    if (
      assignment_status === "rejected" &&
      (!rejection_reason || !rejection_reason.trim())
    ) {
      return res.status(400).json({
        message: "A rejection reason is required."
      });
    }

    const updateSql = `
      UPDATE delivery_assignments da
      INNER JOIN riders r ON r.rider_id = da.rider_id
      SET
        da.assignment_status = ?,
        da.rejection_reason = ?,
        da.responded_at = CURRENT_TIMESTAMP
      WHERE da.assignment_id = ?
        AND r.user_id = ?
        AND da.assignment_status = 'assigned'
    `;

    db.query(
      updateSql,
      [
        assignment_status,
        assignment_status === "rejected" ? rejection_reason.trim() : null,
        assignmentId,
        req.user.user_id
      ],
      (error, result) => {
        if (error) {
          console.error("Error responding to assignment:", error);
          return res.status(500).json({ message: "Failed to update assignment." });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            message: "Assigned delivery not found or already answered."
          });
        }

        const contextSql = `
          SELECT
            d.order_id,
            o.user_id AS customer_user_id,
            u.first_name AS rider_first_name,
            u.last_name AS rider_last_name
          FROM delivery_assignments da
          INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
          INNER JOIN orders o ON o.order_id = d.order_id
          INNER JOIN riders r ON r.rider_id = da.rider_id
          INNER JOIN users u ON u.user_id = r.user_id
          WHERE da.assignment_id = ?
          LIMIT 1
        `;

        db.query(contextSql, [assignmentId], (contextError, contexts) => {
          if (contextError || contexts.length === 0) {
            return res.status(200).json({
              message: "Assignment response saved.",
              assignment_id: assignmentId,
              assignment_status
            });
          }

          const context = contexts[0];
          const riderName = `${context.rider_first_name} ${context.rider_last_name}`;

          notifyRole("admin", {
            type: "assignment",
            order_id: context.order_id,
            title:
              assignment_status === "accepted"
                ? "Rider accepted the delivery"
                : "Rider rejected the delivery",
            message:
              assignment_status === "accepted"
                ? `${riderName} accepted order #${context.order_id}.`
                : `${riderName} rejected order #${context.order_id}: ${rejection_reason.trim()}`
          });

          if (assignment_status === "accepted") {
            notifyUser(context.customer_user_id, {
              type: "delivery",
              order_id: context.order_id,
              title: "Your rider is on the way",
              message: `${riderName} accepted your delivery for order #${context.order_id}.`
            });
          }

          return res.status(200).json({
            message: "Assignment response saved.",
            assignment_id: assignmentId,
            assignment_status
          });
        });
      }
    );
  }
);

// Rider completes an assignment they previously accepted.
router.put(
  "/assignments/:assignmentId/complete",
  authenticateToken,
  authorizeRoles("rider"),
  (req, res) => {
    const assignmentId = Number(req.params.assignmentId);

    const completeSql = `
      UPDATE delivery_assignments da
      INNER JOIN riders r ON r.rider_id = da.rider_id
      SET da.assignment_status = 'completed'
      WHERE da.assignment_id = ?
        AND r.user_id = ?
        AND da.assignment_status = 'accepted'
    `;

    db.query(
      completeSql,
      [assignmentId, req.user.user_id],
      (error, result) => {
        if (error) {
          console.error("Error completing assignment:", error);
          return res.status(500).json({
            message: "Failed to complete assignment."
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            message: "Accepted delivery assignment not found."
          });
        }

        const proceed = () => {
          const contextSql = `
            SELECT d.order_id, o.user_id AS customer_user_id
            FROM delivery_assignments da
            INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
            INNER JOIN orders o ON o.order_id = d.order_id
            WHERE da.assignment_id = ?
            LIMIT 1
          `;

          db.query(contextSql, [assignmentId], (contextError, contexts) => {
            if (!contextError && contexts.length > 0) {
              notifyUser(contexts[0].customer_user_id, {
                type: "delivery",
                order_id: contexts[0].order_id,
                title: "Delivery completed",
                message: `Order #${contexts[0].order_id} has been delivered. Thank you!`
              });

              notifyRole("admin", {
                type: "delivery",
                order_id: contexts[0].order_id,
                title: "Delivery completed",
                message: `Order #${contexts[0].order_id} was marked delivered by the rider.`
              });
            }

            return res.status(200).json({
              message: "Delivery assignment marked completed.",
              assignment_id: assignmentId,
              assignment_status: "completed"
            });
          });
        };

        // Non-COD payments are already captured at checkout, so completing the
        // assignment completes the order and delivery too. COD is finalized by
        // the collect-cod step instead.
        const finalizeSql = `
          SELECT d.delivery_id, d.order_id, p.payment_method, p.payment_status
          FROM delivery_assignments da
          INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
          LEFT JOIN payments p ON p.order_id = d.order_id
          WHERE da.assignment_id = ?
          LIMIT 1
        `;

        db.query(finalizeSql, [assignmentId], (finalizeError, rows) => {
          const shouldDeliver =
            !finalizeError &&
            rows.length > 0 &&
            rows[0].payment_method &&
            rows[0].payment_method !== "cod" &&
            rows[0].payment_status === "successful";

          if (!shouldDeliver) return proceed();

          const { delivery_id, order_id } = rows[0];
          db.query(
            "UPDATE orders SET order_status = 'delivered' WHERE order_id = ? AND order_status <> 'delivered'",
            [order_id],
            () => {
              db.query(
                "UPDATE deliveries SET delivery_status = 'delivered' WHERE delivery_id = ? AND delivery_status <> 'delivered'",
                [delivery_id],
                () => proceed()
              );
            }
          );
        });
      }
    );
  }
);

// After a completed COD delivery, the rider confirms cash collection. Inventory,
// payment, order, and delivery status change together or all roll back.
router.put(
  "/assignments/:assignmentId/collect-cod",
  authenticateToken,
  authorizeRoles("rider"),
  async (req, res) => {
    const assignmentId = Number(req.params.assignmentId);
    const connection = db.promise();
    let transactionStarted = false;

    try {
      await connection.beginTransaction();
      transactionStarted = true;

      const [assignments] = await connection.query(
        `SELECT
          da.delivery_id,
          d.order_id,
          p.payment_id,
          p.payment_method,
          p.payment_status,
          o.total_amount,
          o.user_id AS customer_user_id
        FROM delivery_assignments da
        INNER JOIN riders r ON r.rider_id = da.rider_id
        INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
        INNER JOIN orders o ON o.order_id = d.order_id
        INNER JOIN payments p ON p.order_id = d.order_id
        WHERE da.assignment_id = ?
          AND r.user_id = ?
          AND da.assignment_status = 'completed'
        FOR UPDATE`,
        [assignmentId, req.user.user_id]
      );

      if (assignments.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Completed delivery assignment not found."
        });
      }

      const assignment = assignments[0];

      if (assignment.payment_method !== "cod") {
        await connection.rollback();
        return res.status(400).json({
          message: "This delivery does not use Cash on Delivery."
        });
      }

      if (assignment.payment_status !== "pending") {
        await connection.rollback();
        return res.status(400).json({
          message: "COD payment has already been processed."
        });
      }

      const [orderItems] = await connection.query(
        `SELECT
          oi.product_id,
          oi.quantity,
          p.product_name,
          ps.stock_id,
          ps.stock_quantity
        FROM order_items oi
        INNER JOIN products p ON p.product_id = oi.product_id
        INNER JOIN product_stock ps ON ps.product_id = oi.product_id
        WHERE oi.order_id = ?
        FOR UPDATE`,
        [assignment.order_id]
      );

      if (orderItems.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: "No order items were found." });
      }

      for (const item of orderItems) {
        if (Number(item.stock_quantity) < Number(item.quantity)) {
          await connection.rollback();
          return res.status(400).json({
            message:
              `Insufficient stock for ${item.product_name}. ` +
              `Available: ${item.stock_quantity}. Requested: ${item.quantity}.`
          });
        }
      }

      const lowStockItems = [];
      for (const item of orderItems) {
        await connection.query(
          `UPDATE product_stock
           SET stock_quantity = stock_quantity - ?
           WHERE stock_id = ?`,
          [Number(item.quantity), item.stock_id]
        );

        const remaining =
          Number(item.stock_quantity) - Number(item.quantity);

        if (remaining <= 5) {
          lowStockItems.push({
            product_name: item.product_name,
            remaining
          });
        }
      }

      const reference = `COD-COLLECTED-${assignment.payment_id}`;
      const [paymentResult] = await connection.query(
        `UPDATE payments
         SET payment_status = 'successful',
             transaction_reference = ?,
             payment_date = CURRENT_TIMESTAMP
         WHERE payment_id = ?
           AND payment_status = 'pending'`,
        [reference, assignment.payment_id]
      );

      if (paymentResult.affectedRows === 0) {
        throw new Error("COD payment could not be updated.");
      }

      await connection.query(
        "UPDATE orders SET order_status = 'delivered' WHERE order_id = ?",
        [assignment.order_id]
      );
      await connection.query(
        "UPDATE deliveries SET delivery_status = 'delivered' WHERE delivery_id = ?",
        [assignment.delivery_id]
      );

      await connection.commit();

      notifyUser(assignment.customer_user_id, {
        type: "payment",
        order_id: assignment.order_id,
        delivery_id: assignment.delivery_id,
        title: "Cash payment received",
        message: `We collected ₱${Number(assignment.total_amount).toFixed(2)} for order #${assignment.order_id}. Your order is now delivered.`
      });

      notifyRole("admin", {
        type: "payment",
        order_id: assignment.order_id,
        delivery_id: assignment.delivery_id,
        title: "COD collected",
        message: `Cash on delivery for order #${assignment.order_id} was collected (${reference}).`
      });

      lowStockItems.forEach((item) => {
        notifyRole("admin", {
          type: "stock",
          title: "Low stock alert",
          message: `${item.product_name} is down to ${item.remaining} unit(s) in stock after order #${assignment.order_id}.`
        });
      });

      return res.status(200).json({
        message: "COD collection confirmed and delivery completed.",
        assignment_id: assignmentId,
        order_id: assignment.order_id,
        delivery_id: assignment.delivery_id,
        payment_id: assignment.payment_id,
        payment_status: "successful",
        order_status: "delivered",
        delivery_status: "delivered",
        transaction_reference: reference
      });
    } catch (error) {
      console.error("Error collecting COD payment:", error);
      if (transactionStarted) {
        await connection.rollback();
      }
      return res.status(500).json({
        message: "COD collection could not be completed."
      });
    }
  }
);

module.exports = router;
