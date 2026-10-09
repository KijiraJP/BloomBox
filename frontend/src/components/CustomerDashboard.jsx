import React, { useEffect, useState } from "react";

import CustomerHome from "./CustomerHome";
import Catalog from "./Catalog";
import ProductDetails from "./ProductDetails";
import Cart from "./Cart";
import Checkout from "./Checkout";
import CustomerProfile from "./CustomerProfile";
import NotificationBell from "./NotificationBell";

function CustomerDashboard({ onLogout }) {
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("Loading account...");
  const [currentPage, setCurrentPage] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartCount, setCartCount] = useState(0);

  const refreshCartCount = async () => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/cart", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const count = (data.items || []).reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
      );

      setCartCount(count);
    } catch (error) {
      console.error("Cart count error:", error);
    }
  };

  useEffect(() => {
    refreshCartCount();
  }, [currentPage]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const token = sessionStorage.getItem("token");

      if (!token) {
        setMessage("No login session found.");
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
          setMessage(data.message || "Unable to load account.");
          return;
        }

        setUser(data.user);
        setMessage("");

      } catch (error) {
        console.error("Account error:", error);
        setMessage("Cannot connect to the server.");
      }
    };

    getCurrentUser();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    onLogout();
  };

  let content = null;

  if (message) {
    content = (
      <div>
        <h1>Customer Dashboard</h1>
        <p>{message}</p>
      </div>
    );
  } else if (currentPage === "catalog") {
    content = (
      <Catalog
        onBack={() => setCurrentPage("home")}
        onProductSelect={(product) => {
          setSelectedProduct(product);
          setCurrentPage("product");
        }}
      />
    );
  } else if (currentPage === "product") {
    content = (
      <ProductDetails
        product={selectedProduct}
        cartCount={cartCount}
        onHome={() => setCurrentPage("home")}
        onBack={() => setCurrentPage("catalog")}
        onAddToCart={() => refreshCartCount()}
        onGoToCart={() => setCurrentPage("cart")}
        onSelectProduct={(product) => {
          setSelectedProduct(product);
          setCurrentPage("product");
        }}
      />
    );
  } else if (currentPage === "cart") {
    content = (
      <Cart
        onBack={() => setCurrentPage("catalog")}
        onCheckout={() => setCurrentPage("checkout")}
      />
    );
  } else if (currentPage === "checkout") {
    content = (
      <Checkout
        onBack={() => setCurrentPage("cart")}
        onContinue={(data) => {
          console.log("Checkout completed:", data);
          refreshCartCount();
        }}
      />
    );
  } else if (currentPage === "profile") {
    content = <CustomerProfile user={user} onBack={() => setCurrentPage("home")} />;
  } else {
    content = (
      <CustomerHome
        user={user}
        cartCount={cartCount}
        onLogout={handleLogout}
        onNavigate={setCurrentPage}
        onProductSelect={(product) => {
          setSelectedProduct(product);
          setCurrentPage("product");
        }}
      />
    );
  }

  return (
    <>
      <div className="notif-float">
        <NotificationBell />
      </div>
      {content}
    </>
  );
}

export default CustomerDashboard;
