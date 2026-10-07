import React, { useEffect, useState } from "react";

import RoleSelection from "./components/RoleSelection";

import CustomerLogin from "./components/CustomerLogin";
import CustomerRegister from "./components/CustomerRegister";
import CustomerDashboard from "./components/CustomerDashboard";

import RiderLogin from "./components/RiderLogin";
import RiderDashboard from "./components/RiderDashboard";

import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const token = sessionStorage.getItem("token");

      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:5000/api/auth/me",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          sessionStorage.removeItem("token");
          setCheckingSession(false);
          return;
        }

        setUser(data.user);
        setCheckingSession(false);

      } catch (error) {
        console.error("Session check error:", error);

        sessionStorage.removeItem("token");
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const handleLoginSuccess = async () => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      console.error("No token found after login.");
      return;
    }

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/me",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Unable to get logged-in user:", data);
        sessionStorage.removeItem("token");
        return;
      }

      setUser(data.user);
      setSelectedRole(data.user.role);

    } catch (error) {
      console.error("Login session error:", error);
      sessionStorage.removeItem("token");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("token");

    setUser(null);
    setSelectedRole(null);
    setShowRegister(false);
  };

  if (checkingSession) {
    return (
      <div>
        <h1>BloomBox Florals</h1>
        <p>Checking your session...</p>
      </div>
    );
  }

  /*
    If a user is already authenticated,
    show the dashboard based on the role
    returned by the backend.
  */

  if (user) {
    if (user.role === "customer") {
      return (
        <CustomerDashboard
          onLogout={handleLogout}
        />
      );
    }

    if (user.role === "rider") {
      return (
        <RiderDashboard
          onLogout={handleLogout}
        />
      );
    }

    if (user.role === "admin") {
      return (
        <AdminDashboard
          onLogout={handleLogout}
        />
      );
    }

    return (
      <div>
        <h1>Unknown Account Role</h1>
        <p>
          Your account role is not recognized by the application.
        </p>

        <button onClick={handleLogout}>
          Logout
        </button>
      </div>
    );
  }

  /*
    No authenticated user.
    Show the role selection screen.
  */

  if (!selectedRole) {
    return (
      <RoleSelection
        onSelectRole={setSelectedRole}
      />
    );
  }

  /*
    Customer registration
  */

  if (
    selectedRole === "customer" &&
    showRegister
  ) {
    return (
      <CustomerRegister
        onBack={() => setShowRegister(false)}
        onRegistered={() => setShowRegister(false)}
      />
    );
  }

  /*
    Customer login
  */

  if (
    selectedRole === "customer" &&
    !user
  ) {
    return (
      <CustomerLogin
        onBack={() => {
          setShowRegister(false);
          setSelectedRole(null);
        }}
        onLoginSuccess={handleLoginSuccess}
        onRegister={() => setShowRegister(true)}
      />
    );
  }

  /*
    Rider login
  */

  if (
    selectedRole === "rider" &&
    !user
  ) {
    return (
      <RiderLogin
        onBack={() => setSelectedRole(null)}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  /*
    Admin login
  */

  if (
    selectedRole === "admin" &&
    !user
  ) {
    return (
      <AdminLogin
        onBack={() => setSelectedRole(null)}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return null;
}

export default App;