import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Container, Nav, Row } from "react-bootstrap";
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

  if (!user) return <div className="admin-loading"><h1>Admin Dashboard</h1><p>{message}</p></div>;
  const nav = [["assignments", "Orders & Assign", "bi-diagram-3"], ["products", "Products", "bi-flower1"], ["inventory", "Inventory", "bi-box-seam"], ["sales", "Sales", "bi-graph-up"]];
  return <div className="admin-dashboard-wrapper">
    <header className="admin-topbar"><div><h1>bloombox<span>.</span></h1><Badge>ADMIN PORTAL</Badge></div><div className="admin-profile"><div className="admin-avatar">{user.first_name[0]}</div><div><strong>{user.first_name} {user.last_name}</strong><small>Administrator</small></div><Button variant="outline-dark" size="sm" onClick={() => { sessionStorage.removeItem("token"); onLogout(); }}>Logout</Button></div></header>
    <Container fluid className="admin-content"><Row><Col md={3} lg={2} className="admin-sidebar"><p className="admin-sidebar-label">DASHBOARD</p><Nav className="flex-column gap-2">{nav.map(([key,label,icon]) => <Nav.Link key={key} onClick={() => setActive(key)} className={active === key ? "admin-nav-active" : ""}><i className={`bi ${icon}`} /> {label}</Nav.Link>)}</Nav><Card className="admin-monitor-card"><Card.Body><span>●</span><strong> Delivery Monitor Active</strong><p>Live rider assignment and COD collection are connected.</p></Card.Body></Card></Col>
    <Col md={9} lg={10} className="admin-main">{message && <div className="admin-message">{message}</div>}{active === "assignments" ? <><div className="admin-section-heading"><div><p>LIVE OPERATIONS</p><h2>Orders & delivery assignment</h2><span>Assign pending deliveries to active riders.</span></div><Button variant="outline-dark" onClick={load}><i className="bi bi-arrow-clockwise" /> Refresh</Button></div><Row className="g-3 mb-4"><Col sm={6} xl={4}><Card className="admin-stat"><Card.Body><small>PENDING ASSIGNMENTS</small><strong>{deliveries.length}</strong></Card.Body></Card></Col><Col sm={6} xl={4}><Card className="admin-stat"><Card.Body><small>ACTIVE RIDERS</small><strong>{riders.length}</strong></Card.Body></Card></Col></Row>{deliveries.length === 0 ? <Card className="admin-empty"><Card.Body><i className="bi bi-check2-circle" /><h3>All deliveries are assigned</h3><p>New customer schedules appear here for assignment.</p></Card.Body></Card> : deliveries.map((d) => <Card className="admin-delivery-card" key={d.delivery_id}><Card.Body><div className="d-flex justify-content-between flex-wrap gap-2"><div><Badge bg="light" text="dark">DELIVERY #{d.delivery_id}</Badge><h3>Order #{d.order_id}</h3><p><i className="bi bi-calendar3" /> {d.delivery_date} at {d.delivery_time}</p><p><i className="bi bi-geo-alt" /> {d.street}, {d.barangay}, {d.city}</p></div><strong>₱{Number(d.total_amount).toFixed(2)}</strong></div><div className="admin-assign-control"><select value={choices[d.delivery_id] || ""} onChange={(e) => setChoices({ ...choices, [d.delivery_id]: e.target.value })}><option value="">Select active rider</option>{riders.map((r) => <option key={r.rider_id} value={r.rider_id}>{r.first_name} {r.last_name}</option>)}</select><Button onClick={() => assign(d.delivery_id)}>Assign Rider</Button></div></Card.Body></Card>)}</> : <Card className="admin-empty"><Card.Body><i className="bi bi-tools" /><h3>{active[0].toUpperCase() + active.slice(1)} module</h3><p>This presentation layout is ready; live database integration is the next module.</p></Card.Body></Card>}</Col></Row></Container>
  </div>;
}
export default AdminDashboard;
