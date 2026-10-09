# Admin Order Calendar — Implementation Plan

## Goal
New admin sidebar tab **"Order Calendar"**: a month calendar where each day an order was delivered shows a badge; clicking a day lists those orders with a "✓ Delivered <date>" mark. Scope confirmed: **delivered only**, and **include the non-COD finalize fix**.

## Decisions
- **Delivered timestamp**: `DATE(deliveries.updated_at)` where `delivery_status = 'delivered'` — no schema change needed (nothing updates a delivery row after it is delivered).
- **Companion fix**: rider `complete` endpoint must finalize non-COD orders (payment already `successful`) → set `order_status = 'delivered'` and `delivery_status = 'delivered'`. COD keeps its existing `collect-cod` finalization.
- **Backfill**: one existing row (5 completed assignments vs 4 delivered) is an online-paid order finished before the fix — backfill it with a one-time UPDATE so demo data is consistent.

## Backend — `backend/routes/deliveryRoutes.js`
1. **New endpoint** `GET /api/deliveries/admin/calendar` (`authenticateToken` + `authorizeRoles("admin")`):
   - Query all `deliveries d WHERE d.delivery_status = 'delivered'`, joined with:
     - `orders o` (total_amount, order_status, user_id)
     - `users u` (customer first/last name)
     - `delivery_assignments da` (`assignment_status = 'completed'`) → `riders r` → rider user name
     - `payments p` (payment_method)
   - Return: `delivery_id, order_id, delivered_on = DATE(d.updated_at), delivery_date, delivery_time, total_amount, customer_name, rider_name, payment_method, order_status`.
   - Order by `delivered_on DESC`.
2. **Fix `/assignments/:assignmentId/complete`** (currently only sets `assignment_status`):
   - After a successful update, look up the order's `payment_method` + `payment_status`.
   - If `payment_method !== 'cod'` **and** `payment_status = 'successful'` → also run:
     - `UPDATE orders SET order_status = 'delivered' WHERE order_id = ?`
     - `UPDATE deliveries SET delivery_status = 'delivered' WHERE delivery_id = ?`
   - COD path unchanged (collect-cod already finalizes inside its transaction).
   - Side benefit: customer order history (`orderRoutes /history` filters `order_status = 'delivered'`) now includes online-paid orders.

## Frontend
3. **`frontend/src/components/AdminDashboard.jsx`** (52 lines, dense one-line JSX — match that style):
   - Line 45 `nav`: add `["calendar", "Order Calendar", "bi-calendar3"]`.
   - New state: `calendarOrders` (array), `calMonth` (Date cursor, default current month).
   - Load calendar data when the tab is opened (effect on `active === "calendar"` or include in `load()`).
   - New ternary branch `active === "calendar"` before the existing placeholder fallback:
     - Section heading: "ORDER CALENDAR / Delivered orders" + Refresh.
     - Month toolbar: ‹ month-year › + Today button.
     - 7-column grid (Mon–Sun headers), day cells with day number; days containing deliveries show a green badge (✓ + count).
     - Selected-day detail panel: for each order → order #, customer, rider, amount, payment method, and a **"✓ Delivered <date>"** badge.
     - Empty state card when the month has no deliveries (reuse `admin-empty` pattern).
4. **`frontend/src/components/AdminDashboard.css`**:
   - New classes `admin-calendar`, `admin-cal-toolbar`, `admin-cal-grid`, `admin-cal-day`, `admin-cal-badge`, `admin-cal-detail`, `admin-cal-chip` — follow existing `admin-*` look, green accent for delivered, responsive (stack/narrow grid under the existing 767px pattern).

## Data / rollout steps
5. One-time backfill (single row, after endpoint works):
   ```sql
   UPDATE deliveries d
   INNER JOIN delivery_assignments da ON da.delivery_id = d.delivery_id AND da.assignment_status = 'completed'
   INNER JOIN payments p ON p.order_id = d.order_id AND p.payment_status = 'successful'
   LEFT JOIN deliveries x ON x.delivery_id = d.delivery_id AND x.delivery_status = 'delivered'
   SET d.delivery_status = 'delivered'
   WHERE d.delivery_status <> 'delivered' AND p.payment_method <> 'cod';
   UPDATE orders o INNER JOIN deliveries d ON d.order_id = o.order_id SET o.order_status = 'delivered' WHERE d.delivery_status = 'delivered' AND o.order_status <> 'delivered';
   ```

## Verification
- `npm run lint` in `frontend` (baseline: 0 errors, 4 warnings).
- Admin token → `GET /api/deliveries/admin/calendar` returns existing delivered orders (currently 4) with `delivered_on`.
- E2E for the fix: test order → online payment success → schedule → assign → rider accept → complete → statuses become `delivered` → row appears in calendar → clean up test data.
- Regression: COD flow (complete → collect-cod) still finalizes; `/api/deliveries/admin/overview` untouched.
- Vite transform check; user does visual sign-off of the new tab (screenshots).

## Files touched
- `backend/routes/deliveryRoutes.js`
- `frontend/src/components/AdminDashboard.jsx`
- `frontend/src/components/AdminDashboard.css`

## Out of scope
- No schema/migration changes, no customer-facing calendar, other admin tabs stay placeholders, no changes to rider UI.
