import React, { useEffect, useMemo, useState } from "react";
import "./RiderDashboard.css";

function RiderDashboard({ onLogout }) {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [reasons, setReasons] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [message, setMessage] = useState("Loading rider dashboard...");

  const loadDashboard = async () => {
    const token = sessionStorage.getItem("token");
    try {
      const [userResponse, assignmentResponse] = await Promise.all([
        fetch("http://localhost:5000/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("http://localhost:5000/api/deliveries/rider/assignments", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const userData = await userResponse.json();
      const assignmentData = await assignmentResponse.json();
      if (!userResponse.ok || userData.user.role !== "rider") return setMessage(userData.message || "Rider access is required.");
      if (!assignmentResponse.ok) return setMessage(assignmentData.message || "Unable to load assignments.");
      setUser(userData.user);
      setAssignments(assignmentData.assignments);
      setSelectedId((current) => current || assignmentData.assignments[0]?.assignment_id || null);
      setMessage("");
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  useEffect(() => { loadDashboard(); }, []);

  const respond = async (assignmentId, status) => {
    const reason = reasons[assignmentId] || "";
    if (status === "rejected" && !reason.trim()) return setMessage("Enter a reason before rejecting this assignment.");
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/assignments/${assignmentId}/respond`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("token")}` }, body: JSON.stringify({ assignment_status: status, rejection_reason: reason }) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to update assignment.");
      setMessage(`Assignment ${status}.`); loadDashboard();
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const complete = async (assignmentId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/assignments/${assignmentId}/complete`, { method: "PUT", headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to complete assignment.");
      setMessage("Delivery assignment completed."); loadDashboard();
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const collectCod = async (assignmentId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/deliveries/assignments/${assignmentId}/collect-cod`, { method: "PUT", headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` } });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Unable to confirm COD collection.");
      setMessage(`COD collected. Order #${data.order_id} is delivered.`); loadDashboard();
    } catch (error) { console.error(error); setMessage("Cannot connect to the server."); }
  };

  const activeAssignments = useMemo(() => assignments.filter((item) => item.assignment_status === "assigned" || item.assignment_status === "accepted" || (item.assignment_status === "completed" && item.payment_status === "pending")), [assignments]);
  const delivered = useMemo(() => assignments.filter((item) => item.assignment_status === "completed" && item.payment_status === "successful"), [assignments]);
  const selected = assignments.find((item) => item.assignment_id === selectedId) || activeAssignments[0];
  const openMap = (assignment) => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${assignment.street}, ${assignment.barangay}, ${assignment.city}`)}`, "_blank", "noopener,noreferrer");

  if (!user) return <div className="rider-loading"><h1>Rider Dashboard</h1><p>{message}</p></div>;
  const assignmentCard = (item) => <article className="rider-order-card" key={item.assignment_id}><div className="rider-card-top"><span>ORDER #{item.order_id}</span><strong>₱{Number(item.total_amount).toFixed(2)}</strong></div><h3>Delivery #{item.delivery_id}</h3><p><b>Schedule:</b> {item.delivery_date} at {item.delivery_time}</p><p><b>Deliver to:</b> {item.street}, {item.barangay}, {item.city}</p><span className={`rider-status ${item.assignment_status}`}>{item.assignment_status.replaceAll("_", " ")}</span>{item.assignment_status === "assigned" && <div className="rider-card-actions"><button className="rider-primary" onClick={() => { setSelectedId(item.assignment_id); respond(item.assignment_id, "accepted"); }}>Accept order</button><input value={reasons[item.assignment_id] || ""} onChange={(e) => setReasons({ ...reasons, [item.assignment_id]: e.target.value })} placeholder="Reason required to reject" /><button className="rider-secondary" onClick={() => respond(item.assignment_id, "rejected")}>Reject</button></div>}<button className="rider-text-button" onClick={() => { setSelectedId(item.assignment_id); setActiveTab("active"); }}>View delivery</button></article>;

  const renderActive = () => !selected ? <div className="rider-empty">No active delivery selected.</div> : <section className="rider-page"><div className="rider-section-head"><div><span>ACTIVE DELIVERY</span><h2>Order #{selected.order_id}</h2></div><button className="rider-secondary" onClick={() => setActiveTab("dashboard")}>Back to dashboard</button></div><div className="rider-map-panel"><div className="rider-route-line" /><span>BloomBox</span><i>●</i><b>Customer</b></div><div className="rider-summary-grid"><div><small>DELIVERY SCHEDULE</small><strong>{selected.delivery_date} · {selected.delivery_time}</strong></div><div><small>PAYMENT</small><strong>{selected.payment_method === "cod" ? "Cash on Delivery" : selected.payment_method}</strong></div></div><div className="rider-detail-grid"><section><h3>Customer delivery details</h3><p>{selected.street}, {selected.barangay}, {selected.city}</p><button className="rider-primary" onClick={() => openMap(selected)}>Open navigation</button></section><section><h3>Delivery progress</h3><div className="rider-progress"><span className={selected.assignment_status !== "assigned" ? "done" : ""}>Accepted</span><span className={selected.assignment_status === "completed" ? "done" : ""}>Completed</span><span className={selected.payment_status === "successful" ? "done" : ""}>Delivered</span></div>{selected.assignment_status === "accepted" && <button className="rider-primary" onClick={() => complete(selected.assignment_id)}>Mark delivery completed</button>}{selected.assignment_status === "completed" && selected.payment_method === "cod" && selected.payment_status === "pending" && <button className="rider-primary" onClick={() => collectCod(selected.assignment_id)}>Confirm COD collection</button>}{selected.payment_status === "successful" && <p className="rider-success">✓ Delivery and payment completed</p>}</section></div></section>;

  let content = activeTab === "active" ? renderActive() : activeTab === "history" ? <section className="rider-page"><div className="rider-section-head"><div><span>DELIVERY HISTORY</span><h2>Completed deliveries</h2></div></div>{delivered.length ? <div className="rider-history">{delivered.map((item) => <div key={item.assignment_id}><span>Order #{item.order_id}</span><strong>Delivered</strong><small>{item.delivery_date} · ₱{Number(item.total_amount).toFixed(2)}</small></div>)}</div> : <div className="rider-empty">No completed deliveries yet.</div>}</section> : activeTab === "profile" ? <section className="rider-page"><div className="rider-profile"><div>{user.first_name[0]}</div><h2>{user.first_name} {user.last_name}</h2><p>Active BloomBox delivery rider</p><button className="rider-secondary" onClick={() => { sessionStorage.removeItem("token"); onLogout(); }}>Logout</button></div></section> : <section className="rider-page"><div className="rider-section-head"><div><span>RIDER DASHBOARD</span><h2>Today’s deliveries</h2></div><button className="rider-secondary" onClick={loadDashboard}>Refresh</button></div>{message && <div className="rider-message">{message}</div>}<div className="rider-metrics"><div><small>ACTIVE DELIVERY</small><strong>{activeAssignments.length}</strong></div><div><small>COMPLETED TODAY</small><strong>{delivered.length}</strong></div><div><small>DELIVERY STATUS</small><strong>Available</strong></div></div><h3 className="rider-subheading">YOUR ASSIGNMENTS</h3><div className="rider-grid">{activeAssignments.length ? activeAssignments.map(assignmentCard) : <div className="rider-empty">No active deliveries at the moment.</div>}</div></section>;

  return <div className="bloombox-rider-app"><header className="rider-header"><button className="rider-brand" onClick={() => setActiveTab("dashboard")}>bloombox<span>.</span></button><nav>{[["dashboard","Home"],["active","Active delivery"],["history","History"],["profile","Profile"]].map(([key,label]) => <button key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>)}</nav><div className="rider-user"><span>{user.first_name[0]}</span><small>{user.first_name}</small></div></header><main className="rider-main">{content}</main></div>;
}

export default RiderDashboard;
