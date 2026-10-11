import React, { useState } from "react";
import "../bloombox.css";
import "./auth.css";

function CustomerRegister({ onBack, onRegistered }) {
  const [formData, setFormData] = useState({ email: "", password: "", first_name: "", middle_name: "", last_name: "" });
  const [message, setMessage] = useState("");
  const handleChange = (event) => setFormData({ ...formData, [event.target.name]: event.target.value });
  const handleRegister = async (event) => {
    event.preventDefault(); setMessage("Creating your account...");
    try {
      const response = await fetch("http://localhost:5000/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Registration failed.");
      setMessage("Account created successfully. You can now sign in."); onRegistered();
    } catch (error) { console.error("Registration error:", error); setMessage("Cannot connect to the server."); }
  };
  return <div className="auth-page"><div className="announcement">FREE SAME-DAY DELIVERY ON SELECT ORDERS · METRO MANILA</div><main className="auth-layout"><section className="auth-visual"><div className="auth-glow" /><div className="auth-image"><img src="https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=1100&q=85" alt="BloomBox flower arrangement" /></div><div className="auth-float top">❀<strong>Member perks</strong><small>early access to drops</small></div><div className="auth-float bottom">★<strong>Save favorites</strong><small>reorder in one tap</small></div></section><section className="auth-panel"><div className="auth-box"><button className="auth-back" onClick={onBack}>← Back to sign in</button><p className="eyebrow">JOIN BLOOMBOX</p><h1>Create your <em>account</em></h1><p className="auth-subtitle">Save delivery details and make every thoughtful gift easier to send.</p><form className="auth-form" onSubmit={handleRegister}><div className="auth-name-grid"><label><span>First name</span><input name="first_name" value={formData.first_name} onChange={handleChange} placeholder="Juan" required /></label><label><span>Last name</span><input name="last_name" value={formData.last_name} onChange={handleChange} placeholder="Dela Cruz" required /></label></div><label><span>Middle name <small>(optional)</small></span><input name="middle_name" value={formData.middle_name} onChange={handleChange} placeholder="Santos" /></label><label><span>Email address</span><input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required /></label><label><span>Password</span><input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Create a password" required /></label><button className="btn btn-dark auth-submit" type="submit">Create Account <span>→</span></button></form>{message && <p className="auth-message">{message}</p>}<p className="auth-switch">Already have an account? <button onClick={onBack}>Sign in</button></p></div></section></main></div>;
}
export default CustomerRegister;
