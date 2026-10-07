const express = require("express");
const router = express.Router();

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

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
        d.delivery_date,
        d.delivery_time,
        d.delivery_status,
        d.street,
        d.barangay,
        d.city,
        o.total_amount
      FROM deliveries d
      INNER JOIN orders o ON o.order_id = d.order_id
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
      SELECT r.rider_id
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

      const deliverySql = `
        SELECT delivery_id
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
        d.delivery_date,
        d.delivery_time,
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

        return res.status(200).json({
          message: "Assignment response saved.",
          assignment_id: assignmentId,
          assignment_status
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

        return res.status(200).json({
          message: "Delivery assignment marked completed.",
          assignment_id: assignmentId,
          assignment_status: "completed"
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
          p.payment_status
        FROM delivery_assignments da
        INNER JOIN riders r ON r.rider_id = da.rider_id
        INNER JOIN deliveries d ON d.delivery_id = da.delivery_id
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

      for (const item of orderItems) {
        await connection.query(
          `UPDATE product_stock
           SET stock_quantity = stock_quantity - ?
           WHERE stock_id = ?`,
          [Number(item.quantity), item.stock_id]
        );
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
