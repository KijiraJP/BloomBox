import React, { useEffect, useMemo, useState } from "react";
import "../bloombox.css";
import "./CustomerProfile.css";

function CustomerProfile({ user, onBack }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/orders/history", {
          headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load completed orders.");
        setOrders(data.orders || []);
      } catch (requestError) {
        console.error("Customer history error:", requestError);
        setError(requestError.message || "Unable to load completed orders.");
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  const totalSpent = useMemo(
    () => orders.reduce((total, order) => total + Number(order.total_amount || 0), 0),
    [orders]
  );
  const money = (amount) => Number(amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const schedule = (order) => order.delivery_date ? `${String(order.delivery_date).slice(0, 10)}${order.delivery_time ? ` · ${String(order.delivery_time).slice(0, 5)}` : ""}` : "Delivery completed";

  return <main className="profile-page">
    <section className="profile-hero">
      <div className="profile-hero-inner">
        <button type="button" className="profile-back" onClick={onBack}>← Back to Home</button>
        <p className="eyebrow">MY BLOOMBOX</p>
        <h1>Hello, {user?.first_name || "there"}.</h1>
        <p>Your thoughtful orders and completed deliveries, all in one place.</p>
      </div>
    </section>

    <section className="profile-content">
      <aside className="profile-account-card">
        <div className="profile-avatar">{(user?.first_name || "B").charAt(0).toUpperCase()}</div>
        <p className="eyebrow">CUSTOMER ACCOUNT</p>
        <h2>{user?.first_name} {user?.last_name}</h2>
        <p>{user?.email}</p>
        <div className="profile-account-note">Your completed BloomBox orders are securely linked to this account.</div>
      </aside>

      <div className="profile-history">
        <div className="profile-stats">
          <div><span>Completed orders</span><strong>{orders.length}</strong></div>
          <div><span>Total spent</span><strong>₱{money(totalSpent)}</strong></div>
        </div>
        <div className="profile-history-head"><div><p className="eyebrow">ORDER HISTORY</p><h2>Completed orders</h2></div><span>{orders.length} {orders.length === 1 ? "delivery" : "deliveries"}</span></div>

        {loading && <div className="profile-empty">Loading your completed orders...</div>}
        {error && <div className="profile-empty profile-error">{error}</div>}
        {!loading && !error && orders.length === 0 && <div className="profile-empty"><h3>No completed orders yet.</h3><p>Once a BloomBox delivery is completed, it will appear here.</p></div>}
        {!loading && !error && orders.map((order) => <article className="profile-order-card" key={order.order_id}>
          <div className="profile-order-top"><div><p className="eyebrow">ORDER #{order.order_id}</p><h3>{order.items || "BloomBox order"}</h3></div><strong>₱{money(order.total_amount)}</strong></div>
          <div className="profile-order-meta"><span>✓ Delivered</span><span>{schedule(order)}</span><span>{String(order.payment_method || "payment").replace("_", " ")}</span></div>
          {order.transaction_reference && <p className="profile-reference">Payment reference: {order.transaction_reference}</p>}
        </article>)}
      </div>
    </section>
  </main>;
}

export default CustomerProfile;
