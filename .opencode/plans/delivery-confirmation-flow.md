# Delivery Confirmation Flow (Preferred Schedule → Admin Review)

## Goal
Stop treating the customer's chosen schedule as a promise. The customer submits a **preferred date + time**; the admin reviews the order details in a **modal** and either **confirms** it (optionally adjusting the schedule) or **declines** it with a required reason, cancelling the request and notifying the customer.

No windows, no cutoff/lead-time rules.

## Locked decisions
- Customer keeps **date + time** inputs, relabeled as *preferred*. No windows, no cutoff.
- Admin opens the order in a **modal** showing the order details, then **Confirm** or **Decline**.
- **Decline requires a typed reason** → request is **cancelled** → customer is notified with the reason.
- Notifications copy updated to match the new flow.

## Assumptions to confirm at approval
1. **Admin can adjust the date/time before confirming** (accept-with-adjust) — from the option you chose. Decline is the only way to reject.
2. **Decline scope:** cancelling the request also marks the **order** `cancelled` (otherwise the order is orphaned and can't be rebooked, since `deliveries` has `UNIQUE(order_id)`). Recommendation: cancel the order too. Alternative (more work): let the customer rebook by reusing the delivery row.
3. Minimal sanity check on submit: the preferred date **cannot be in the past** (this is not the cutoff — just a guard).

## Data model (migration)
`deliveries`:
- Extend `delivery_status` enum with `'confirmed'`:
  `ENUM('pending','confirmed','assigned','accepted','out_for_delivery','delivered','failed','cancelled')`.
- Add `rejection_reason TEXT NULL` (admin's decline reason).
- Add `confirmed_at DATETIME NULL`.
- Keep `delivery_date` / `delivery_time` and the unique key as-is (no column removed).

Migration SQL:
```sql
ALTER TABLE deliveries
  MODIFY COLUMN delivery_status ENUM('pending','confirmed','assigned','accepted',
    'out_for_delivery','delivered','failed','cancelled') NOT NULL DEFAULT 'pending',
  ADD COLUMN rejection_reason TEXT NULL AFTER delivery_status,
  ADD COLUMN confirmed_at DATETIME NULL AFTER rejection_reason;
```
Also update `backend/schema.sql` to match. **Back up the DB before migrating.**

Status meanings: `pending` = Requested/awaiting review, `confirmed` = admin approved schedule, `cancelled` = declined. Existing rows keep `pending`/`delivered` (still valid).

## Backend — `backend/routes/deliveryRoutes.js`
1. **`POST /`** (customer schedule): body unchanged. New notification copy:
   - customer → "Delivery request received" / "Your preferred schedule for order #X (date at time) was sent for confirmation."
   - admin → "Delivery request awaiting confirmation" / "Order #X requests date at time. Review and confirm or decline."
   - Optional guard: reject a past `delivery_date`.
2. **`PUT /:deliveryId/confirm`** (new, admin):
   - Body `{ decision: 'accepted'|'rejected', delivery_date?, delivery_time?, reason? }`.
   - Guard: only allowed while `delivery_status = 'pending'`.
   - `accepted`: apply any adjusted date/time, set `delivery_status='confirmed'`, `confirmed_at=NOW()`, clear `rejection_reason`; notify customer "Delivery confirmed for date at time."
   - `rejected`: require `reason`; set `delivery_status='cancelled'`, store `reason`; notify customer "Delivery request declined: reason." (+ cancel order per assumption 2).
3. **`POST /:deliveryId/assign`** (existing): add guard requiring `delivery_status='confirmed'` (error: "Confirm this delivery schedule before assigning a rider.").
4. **`GET /admin/overview`** (existing): add customer name + `delivery_status` (already selected) so the UI can split and label. Riders list unchanged.
5. **`GET /admin/:deliveryId`** (new, admin): full details for the modal — order (id, status, total, created_at), customer (name/email), address, items (`order_items`: qty, product_name, size, wrap_style, gift_message, unit_price, subtotal), payment (method/status), delivery (date/time/status/rejection_reason).

`GET /admin/calendar` is unchanged (still driven by `delivered`).

## Frontend
6. **`Checkout.jsx`** (step 03): heading → "Preferred delivery schedule"; labels → "Preferred date" / "Preferred time"; helper text "BloomBox will confirm your preferred schedule." Keep inputs and `min` today; no cutoff.
7. **`AdminDashboard.jsx`**:
   - Split the overview list by status: **"Awaiting confirmation"** (`pending`) and **"Ready to assign"** (`confirmed`). Stat cards count each.
   - Pending card → **Review** button opens a react-bootstrap **`Modal`** fetched from `GET /admin/:deliveryId`, showing full order details, editable preferred date/time, and **Confirm** / **Decline** actions (Decline needs a reason). Actions call the confirm endpoint and reload.
   - Confirmed card → existing assign-rider control.
   - Import `Modal`.
8. **`AdminDashboard.css`**: modal + review-card styles, responsive (existing 767 breakpoint).
9. **`RiderDashboard.jsx` / `CustomerProfile.jsx`**: no functional change; optionally relabel to "Confirmed schedule".

## Verification
- Migration applied; `schema.sql` updated; DB backed up first.
- Update **`notif-e2e.ps1`** and **`calendar-e2e.ps1`**: insert the new admin **confirm** step before assign, and add cases for: assign blocked while `pending`; **decline** → status `cancelled` + reason stored + customer notified; accept-with-adjust updates the schedule.
- `npm run lint` (baseline 0 errors / 4 warnings) and Vite transform check.
- Manually re-run the calendar E2E to confirm no regression.

## Out of scope
- Windows, cutoffs, capacity/shop-hours (Phase 3).
- Payments/refund logic on cancellation.
- Customer rebooking UI (unless we pick the alternative for assumption 2).

## Files touched
- `backend/schema.sql`
- `backend/routes/deliveryRoutes.js`
- `frontend/src/components/Checkout.jsx`
- `frontend/src/components/AdminDashboard.jsx`
- `frontend/src/components/AdminDashboard.css`
- temp E2E scripts (`notif-e2e.ps1`, `calendar-e2e.ps1`)
