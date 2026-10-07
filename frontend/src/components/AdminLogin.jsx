import React, { useState } from "react";
import "../bloombox.css";
import "./auth.css";

function AdminLogin({ onBack, onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setMessage("Logging in...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Login failed.");
        return;
      }

      // Make sure this account is actually an admin.
      if (data.user.role !== "admin") {
        setMessage(
          "This account is not authorized as an administrator."
        );
        return;
      }

      sessionStorage.setItem("token", data.token);

      console.log("Admin login response:", data);
      console.log("Admin:", data.user);

      onLoginSuccess();
    } catch (error) {
      console.error("Admin login error:", error);
      setMessage("Cannot connect to the server.");
    }
  };

  return <div className="auth-page staff-auth staff-admin">
    <div className="announcement">BLOOMBOX OPERATIONS PORTAL</div>
    <main className="auth-layout">
      <section className="auth-visual"><div className="auth-glow" /><div className="auth-image"><img src="https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1100&q=85" alt="BloomBox floral work" /></div><div className="auth-float top">✦<strong>Operations</strong><small>orders, inventory & delivery</small></div><div className="auth-float bottom">⌁<strong>BloomBox Admin</strong><small>manage every thoughtful delivery</small></div></section>
      <section className="auth-panel"><div className="auth-box">
        <button type="button" className="auth-back" onClick={onBack}>← Choose another role</button>
        <p className="eyebrow">STAFF ACCESS</p><h1>Admin <em>portal</em></h1>
        <p className="auth-subtitle">Manage BloomBox orders, rider assignments, and delivery operations from one place.</p>
        <form className="auth-form" onSubmit={handleLogin}>
          <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@bloombox.local" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
          <button className="btn btn-dark auth-submit" type="submit">Sign in to Admin <span>→</span></button>
        </form>
        {message && <p className="auth-message">{message}</p>}<p className="auth-switch">Authorized BloomBox staff only.</p>
      </div></section>
    </main>
  </div>;
}

export default AdminLogin;
