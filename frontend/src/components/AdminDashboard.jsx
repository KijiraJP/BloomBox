import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Container, Modal, Nav, Row } from "react-bootstrap";
import NotificationBell from "./NotificationBell";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./AdminDashboard.css";

function AdminDashboard({ onLogout }) {
  const [user, setUser] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [riders, setRiders] = useState([]);
  const [choices, setChoices] = useState({});
  const [active, setActive] = useState("assignments");
  const [message, setMessage] = useState("Loading administrator dashboard...");
  const [calendarOrders, setCalendarOrders] = useState([]);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [calSelected, setCalSelected] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewDate, setReviewDate] = useState("");
  const [reviewTime, setReviewTime] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const load = async () => {
    const token = sessionStorage.getItem("token");
    try {
      const [meResponse, overviewResponse] = await Promise.all([
        fetch("http://localhost:5000/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("http://localhost:5000/api/deliveries/admin/overview", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const me = await meResponse.json();
      const overview = await overviewResponse.json();
      if (!meResponse.ok || me.user.role !== "admin") return setMessage(me.message || "Administrator access is required.");
      if (!overviewResponse.ok) return setMessage(overview.message || "Unable to load delivery data.");
      setUser(me.user); setDeliveries(overview.deliveries); setRiders(overview.riders); setMessage("");
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const loadCalendar = async () => {
    const token = sessionStorage.getItem("token");
    try {
      const response = await fetch("http://localhost:5000/api/deliveries/admin/calendar", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to load calendar data.");
      setCalendarOrders(data.deliveries || []); setMessage("");
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  useEffect(() => { load(); }, []);

  const assign = async (deliveryId) => {
    const riderId = choices[deliveryId];
    if (!riderId) return setMessage("Select an active rider before assigning this delivery.");
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/${deliveryId}/assign`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("token")}` }, body: JSON.stringify({ rider_id: Number(riderId) }) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to assign rider.");
      setMessage(`Delivery #${deliveryId} assigned successfully.`); load();
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const openReview = async (deliveryId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/admin/${deliveryId}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to load the delivery.");
      setReview(data); setReviewDate(data.delivery.delivery_date); setReviewTime(data.delivery.delivery_time); setDeclineReason(""); setMessage("");
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const reviewSchedule = async (decision) => {
    if (!review) return;
    if (decision === "rejected" && !declineReason.trim()) return setMessage("Type a reason before declining this schedule.");
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/${review.delivery.delivery_id}/confirm`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("token")}` }, body: JSON.stringify(decision === "rejected" ? { decision, reason: declineReason.trim() } : { decision, delivery_date: reviewDate, delivery_time: reviewTime }) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to review the delivery.");
      setMessage(data.message); setReview(null); setDeclineReason(""); load();
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  if (!user) return <div className="admin-loading"><h1>Admin Dashboard</h1><p>{message}</p></div>;
  const pendingDeliveries = deliveries.filter((d) => d.delivery_status === "pending");
  const confirmedDeliveries = deliveries.filter((d) => d.delivery_status === "confirmed");
  const nav = [["assignments", "Orders & Assign", "bi-diagram-3"], ["calendar", "Order Calendar", "bi-calendar3"], ["products", "Products", "bi-flower1"], ["inventory", "Inventory", "bi-box-seam"], ["sales", "Sales", "bi-graph-up"]];
  const ordersByDay = {};
  calendarOrders.forEach((o) => { if (o.delivered_on) ordersByDay[o.delivered_on] = [...(ordersByDay[o.delivered_on] || []), o]; });
  const calYear = calMonth.getFullYear();
  const calMonthIndex = calMonth.getMonth();
  const monthCells = (() => {
    const offset = (new Date(calYear, calMonthIndex, 1).getDay() + 6) % 7;
    const total = new Date(calYear, calMonthIndex + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) cells.push({ day, key: `${calYear}-${String(calMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  })();
  return <div className="admin-dashboard-wrapper">
    <header className="admin-topbar"><div><h1>bloombox<span>.</span></h1><Badge>ADMIN PORTAL</Badge></div><div className="admin-profile"><NotificationBell /><div className="admin-avatar">{user.first_name[0]}</div><div><strong>{user.first_name} {user.last_name}</strong><small>Administrator</small></div><Button variant="outline-dark" size="sm" onClick={() => { sessionStorage.removeItem("token"); onLogout(); }}>Logout</Button></div></header>
    <Container fluid className="admin-content"><Row><Col md={3} lg={2} className="admin-sidebar"><p className="admin-sidebar-label">DASHBOARD</p><Nav className="flex-column gap-2">{nav.map(([key,label,icon]) => <Nav.Link key={key} onClick={() => { setActive(key); if (key === "calendar") loadCalendar(); }} className={active === key ? "admin-nav-active" : ""}><i className={`bi ${icon}`} /> {label}</Nav.Link>)}</Nav><Card className="admin-monitor-card"><Card.Body><span>●</span><strong> Delivery Monitor Active</strong><p>Live rider assignment and COD collection are connected.</p></Card.Body></Card></Col>
    <Col md={9} lg={10} className="admin-main">{message && <div className="admin-message">{message}</div>}{active === "assignments" ? <><div className="admin-section-heading"><div><p>LIVE OPERATIONS</p><h2>Orders & delivery assignment</h2><span>Review preferred schedules, then assign riders.</span></div><Button variant="outline-dark" onClick={load}><i className="bi bi-arrow-clockwise" /> Refresh</Button></div><Row className="g-3 mb-4"><Col sm={6} xl={4}><Card className="admin-stat"><Card.Body><small>AWAITING CONFIRMATION</small><strong>{pendingDeliveries.length}</strong></Card.Body></Card></Col><Col sm={6} xl={4}><Card className="admin-stat"><Card.Body><small>READY TO ASSIGN</small><strong>{confirmedDeliveries.length}</strong></Card.Body></Card></Col><Col sm={6} xl={4}><Card className="admin-stat"><Card.Body><small>ACTIVE RIDERS</small><strong>{riders.length}</strong></Card.Body></Card></Col></Row>{pendingDeliveries.length === 0 && confirmedDeliveries.length === 0 ? <Card className="admin-empty"><Card.Body><i className="bi bi-check2-circle" /><h3>Nothing waiting right now</h3><p>New customer schedules appear here for review and assignment.</p></Card.Body></Card> : <>{pendingDeliveries.length > 0 && <><h3 className="admin-subheading">AWAITING CONFIRMATION</h3>{pendingDeliveries.map((d) => <Card className="admin-delivery-card" key={d.delivery_id}><Card.Body><div className="d-flex justify-content-between flex-wrap gap-2"><div><Badge bg="warning" text="dark">REVIEW SCHEDULE</Badge><h3>Order #{d.order_id}</h3><p><i className="bi bi-person" /> {d.customer_name}</p><p><i className="bi bi-calendar3" /> Preferred: {d.delivery_date} at {d.delivery_time}</p><p><i className="bi bi-geo-alt" /> {d.street}, {d.barangay}, {d.city}</p></div><strong>₱{Number(d.total_amount).toFixed(2)}</strong></div><div className="admin-assign-control"><Button onClick={() => openReview(d.delivery_id)}><i className="bi bi-search" /> Review schedule</Button></div></Card.Body></Card>)}</>}{confirmedDeliveries.length > 0 && <><h3 className="admin-subheading">READY TO ASSIGN</h3>{confirmedDeliveries.map((d) => <Card className="admin-delivery-card" key={d.delivery_id}><Card.Body><div className="d-flex justify-content-between flex-wrap gap-2"><div><Badge bg="success">CONFIRMED</Badge><h3>Order #{d.order_id}</h3><p><i className="bi bi-person" /> {d.customer_name}</p><p><i className="bi bi-calendar3" /> {d.delivery_date} at {d.delivery_time}</p><p><i className="bi bi-geo-alt" /> {d.street}, {d.barangay}, {d.city}</p></div><strong>₱{Number(d.total_amount).toFixed(2)}</strong></div><div className="admin-assign-control"><select value={choices[d.delivery_id] || ""} onChange={(e) => setChoices({ ...choices, [d.delivery_id]: e.target.value })}><option value="">Select active rider</option>{riders.map((r) => <option key={r.rider_id} value={r.rider_id}>{r.first_name} {r.last_name}</option>)}</select><Button onClick={() => assign(d.delivery_id)}>Assign Rider</Button></div></Card.Body></Card>)}</>}</>}</> : active === "calendar" ? <><div className="admin-section-heading"><div><p>ORDER CALENDAR</p><h2>Delivered orders</h2><span>Every badge marks a day a rider completed a delivery.</span></div><Button variant="outline-dark" onClick={loadCalendar}><i className="bi bi-arrow-clockwise" /> Refresh</Button></div><div className="admin-calendar"><div className="admin-cal-toolbar"><Button variant="outline-dark" size="sm" onClick={() => { setCalMonth(new Date(calYear, calMonthIndex - 1, 1)); setCalSelected(null); }}><i className="bi bi-chevron-left" /></Button><strong>{calMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong><Button variant="outline-dark" size="sm" onClick={() => { setCalMonth(new Date(calYear, calMonthIndex + 1, 1)); setCalSelected(null); }}><i className="bi bi-chevron-right" /></Button><Button variant="outline-dark" size="sm" onClick={() => { setCalMonth(new Date()); setCalSelected(null); }}>Today</Button></div><div className="admin-cal-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div className="admin-cal-head" key={d}>{d}</div>)}{monthCells.map((cell, idx) => { if (!cell) return <div className="admin-cal-day admin-cal-blank" key={`cal-blank-${idx}`} />; const count = (ordersByDay[cell.key] || []).length; return <button type="button" key={cell.key} disabled={!count} className={`admin-cal-day${count ? " admin-cal-has" : ""}${calSelected === cell.key ? " admin-cal-selected" : ""}`} onClick={() => setCalSelected(calSelected === cell.key ? null : cell.key)}><span className="admin-cal-num">{cell.day}</span>{count > 0 && <span className="admin-cal-badge"><i className="bi bi-check2-circle" /> {count}</span>}</button>; })}</div></div>{calendarOrders.length === 0 ? <Card className="admin-empty"><Card.Body><i className="bi bi-calendar-check" /><h3>No delivered orders yet</h3><p>Completed rider deliveries will appear on their delivered date.</p></Card.Body></Card> : calSelected ? <Card className="admin-cal-detail"><Card.Body><div className="admin-cal-detail-head"><h3>Delivered on {calSelected}</h3><Badge bg="success"><i className="bi bi-check-circle-fill" /> DELIVERED</Badge></div>{(ordersByDay[calSelected] || []).map((o) => <div className="admin-cal-row" key={o.delivery_id}><div className="admin-cal-row-info"><strong>Order #{o.order_id}</strong><span><i className="bi bi-person" /> {o.customer_name}</span><span><i className="bi bi-truck" /> {o.rider_name || "Unassigned rider"}</span><span><i className="bi bi-credit-card" /> {o.payment_method ? o.payment_method.toUpperCase() : "N/A"}</span></div><div className="admin-cal-row-end"><span className="admin-cal-chip"><i className="bi bi-check2-circle" /> Delivered {o.delivered_on}</span><strong>₱{Number(o.total_amount).toFixed(2)}</strong><small>Scheduled {o.delivery_date} at {o.delivery_time}</small></div></div>)}</Card.Body></Card> : <p className="admin-cal-hint"><i className="bi bi-arrow-left-circle" /> Select a highlighted day to see the orders delivered on that date.</p>}</> : <Card className="admin-empty"><Card.Body><i className="bi bi-tools" /><h3>{active[0].toUpperCase() + active.slice(1)} module</h3><p>This presentation layout is ready; live database integration is the next module.</p></Card.Body></Card>}</Col></Row></Container>
  {review && <Modal show centered onHide={() => setReview(null)} size="lg"><Modal.Header closeButton><Modal.Title>Delivery #{review.delivery.delivery_id} · Order #{review.delivery.order_id}</Modal.Title></Modal.Header><Modal.Body><div className="admin-review"><div className="admin-review-grid"><div><small>CUSTOMER</small><strong>{review.delivery.customer_name}</strong><span>{review.delivery.customer_email}</span></div><div><small>PLACED</small><strong>{review.delivery.placed_at}</strong><span>Order status: {review.delivery.order_status}</span></div><div><small>PAYMENT</small><strong>{review.delivery.payment_method ? review.delivery.payment_method.toUpperCase() : "N/A"} · {review.delivery.payment_status || "n/a"}</strong><span>{review.delivery.transaction_reference || "No reference"}</span></div><div><small>ADDRESS</small><strong>{review.delivery.street}, {review.delivery.barangay}</strong><span>{review.delivery.city}{review.delivery.landmark ? ` · ${review.delivery.landmark}` : ""}</span></div></div><h4 className="admin-review-subheading">Items</h4><ul className="admin-review-items">{review.items.map((item, idx) => <li key={idx}><span>{item.quantity} × {item.product_name}{item.size ? ` · ${item.size}` : ""}</span><strong>₱{Number(item.subtotal).toFixed(2)}</strong></li>)}</ul><h4 className="admin-review-subheading">Schedule</h4><div className="admin-review-schedule"><div className="admin-field"><label htmlFor="review-date">Preferred date</label><input id="review-date" type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} /></div><div className="admin-field"><label htmlFor="review-time">Preferred time</label><input id="review-time" type="time" value={reviewTime} onChange={(e) => setReviewTime(e.target.value)} /></div></div><div className="admin-field"><label htmlFor="review-reason">Reason (required to decline)</label><textarea id="review-reason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="e.g. The flower shop is closed that day." /></div></div></Modal.Body><Modal.Footer><Button variant="outline-danger" onClick={() => reviewSchedule("rejected")}><i className="bi bi-x-circle" /> Decline & cancel order</Button><Button variant="success" onClick={() => reviewSchedule("accepted")}><i className="bi bi-check2-circle" /> Confirm schedule</Button></Modal.Footer></Modal>}
  </div>;
}
export default AdminDashboard;
