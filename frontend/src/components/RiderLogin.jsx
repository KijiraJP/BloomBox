import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "../bloombox.css";
import "./auth.css";

function RiderLogin({ onBack, onLoginSuccess }) {
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

      // Make sure the account is actually a rider.
      if (data.user.role !== "rider") {
        setMessage(
          "This account is not registered as a rider."
        );
        return;
      }

      sessionStorage.setItem("token", data.token);

      console.log("Rider login response:", data);
      console.log("Rider:", data.user);

      onLoginSuccess();

    } catch (error) {
      console.error("Rider login error:", error);
      setMessage("Cannot connect to the server.");
    }
  };

  const handleGoogleRiderLogin = async (credentialResponse) => {
    setMessage("Logging in with Google...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/google/rider",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            credential: credentialResponse.credential
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Google rider login failed.");
        return;
      }

      // Extra frontend protection.
      if (data.user.role !== "rider") {
        setMessage(
          "This Google account is not registered as a rider."
        );
        return;
      }

      sessionStorage.setItem("token", data.token);

      onLoginSuccess();

    } catch (error) {
      console.error("Google rider login error:", error);
      setMessage("Cannot connect to the server.");
    }
  };

  return <div className="auth-page staff-auth staff-rider">
    <div className="announcement">BLOOMBOX DELIVERY PARTNER PORTAL</div>
    <main className="auth-layout">
      <section className="auth-visual"><div className="auth-glow" /><div className="auth-image"><img src="https://images.unsplash.com/photo-1494336934270-15c0c5c4d1f2?auto=format&fit=crop&w=1100&q=85" alt="BloomBox flowers ready for delivery" /></div><div className="auth-float top">✦<strong>Delivery partner</strong><small>every order, beautifully delivered</small></div><div className="auth-float bottom">⌁<strong>Rider portal</strong><small>view your delivery assignments</small></div></section>
      <section className="auth-panel"><div className="auth-box">
        <button type="button" className="auth-back" onClick={onBack}>← Choose another role</button>
        <p className="eyebrow">DELIVERY TEAM</p><h1>Rider <em>portal</em></h1>
        <p className="auth-subtitle">Sign in to review assignments and keep every BloomBox delivery moving.</p>
        <form className="auth-form" onSubmit={handleLogin}>
          <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="rider@bloombox.local" required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>
          <button className="btn btn-dark auth-submit" type="submit">Sign in to Rider <span>→</span></button>
        </form>
        <div className="auth-divider"><span>or continue with</span></div>
        <div className="auth-google"><GoogleLogin onSuccess={handleGoogleRiderLogin} onError={() => { console.log("Google Rider Login Failed"); setMessage("Google login failed."); }} /></div>
        {message && <p className="auth-message">{message}</p>}
      </div></section>
    </main>
  </div>;
}

export default RiderLogin;
