import React, { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import "../bloombox.css";
import "./auth.css";

function CustomerLogin({ onBack, onLoginSuccess, onRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const handleLogin = async (event) => {
    event.preventDefault(); setMessage("Signing in...");
    try {
      const response = await fetch("http://localhost:5000/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Login failed.");
      sessionStorage.setItem("token", data.token); onLoginSuccess();
    } catch (error) { console.error("Login error:", error); setMessage("Cannot connect to the server."); }
  };
  const handleGoogleLogin = async (credentialResponse) => {
    setMessage("Signing in with Google...");
    try {
      const response = await fetch("http://localhost:5000/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: credentialResponse.credential }) });
      const data = await response.json();
      if (!response.ok) return setMessage(data.message || "Google login failed.");
      sessionStorage.setItem("token", data.token); onLoginSuccess();
    } catch (error) { console.error("Google login error:", error); setMessage("Cannot connect to the server."); }
  };
  return <div className="auth-page"><div className="announcement">FREE SAME-DAY DELIVERY ON SELECT ORDERS · METRO MANILA</div><main className="auth-layout"><section className="auth-visual"><div className="auth-glow" /><div className="auth-image"><img src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1100&q=85" alt="Fresh BloomBox bouquet" /></div><div className="auth-float top">★★★★★<strong>12,400+</strong><small>happy customers</small></div><div className="auth-float bottom">❀<strong>Same-day</strong><small>delivery in Metro Manila</small></div></section><section className="auth-panel"><div className="auth-box"><button className="auth-back" onClick={onBack}>← Choose another role</button><p className="eyebrow">WELCOME BACK</p><h1>Sign in to <em>BloomBox</em></h1><p className="auth-subtitle">Pick up where you left off — review your blooms and check out faster.</p><form className="auth-form" onSubmit={handleLogin}><label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label><button className="btn btn-dark auth-submit" type="submit">Sign In <span>→</span></button></form><div className="auth-divider"><span>or continue with</span></div><div className="auth-google"><GoogleLogin onSuccess={handleGoogleLogin} onError={() => setMessage("Google login failed.")} /></div>{message && <p className="auth-message">{message}</p>}<p className="auth-switch">New to BloomBox? <button onClick={onRegister}>Create an account</button></p></div></section></main></div>;
}
export default CustomerLogin;
