import React from "react";
import "./RoleSelection.css";

function RoleSelection({ onSelectRole }) {
  return (
    <main className="role-selection">
      <div className="role-announcement">Thoughtfully arranged. Beautifully delivered.</div>
      <section className="role-card" aria-labelledby="role-title">
        <div className="role-copy">
          <p className="role-eyebrow">WELCOME TO</p>
          <h1 id="role-title">BloomBox<span>.</span></h1>
          <p>Choose how you would like to continue.</p>
        </div>

        <div className="role-actions">
          <button className="role-option role-option-primary" onClick={() => onSelectRole("customer")}>
            <span>Customer</span><small>Shop flowers and manage your orders</small><b>→</b>
          </button>
          <button className="role-option" onClick={() => onSelectRole("rider")}>
            <span>Rider</span><small>View and deliver assigned orders</small><b>→</b>
          </button>
          <button className="role-admin" onClick={() => onSelectRole("admin")}>Admin sign in →</button>
        </div>
      </section>
    </main>
  );
}

export default RoleSelection;
