import React, { useEffect, useState } from "react";

import CustomerHome from "./CustomerHome";
import Catalog from "./Catalog";
import ProductDetails from "./ProductDetails";
import Cart from "./Cart";
import Checkout from "./Checkout";
import CustomerProfile from "./CustomerProfile";

function CustomerDashboard({ onLogout }) {
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("Loading account...");
  const [currentPage, setCurrentPage] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(null);

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

  if (message) {
    return (
      <div>
        <h1>Customer Dashboard</h1>
        <p>{message}</p>
      </div>
    );
  }

  if (currentPage === "catalog") {
  return (
    <Catalog
      onBack={() => setCurrentPage("home")}
      onProductSelect={(product) => {
        setSelectedProduct(product);
        setCurrentPage("product");
      }}
    />
  );
}

if (currentPage === "product") {
  return (
    <ProductDetails
      product={selectedProduct}
      onBack={() => setCurrentPage("catalog")}
      onAddToCart={(cartItem) => {
        console.log("Cart item:", cartItem);
      }}
      onGoToCart={() => setCurrentPage("cart")}
    />
  );
}

if (currentPage === "cart") {
  return (
    <Cart
      onBack={() => setCurrentPage("catalog")}
      onCheckout={() => setCurrentPage("checkout")}
    />
  );
}

if (currentPage === "checkout") {
  return (
    <Checkout
      onBack={() => setCurrentPage("cart")}
      onContinue={(data) => {
        console.log("Checkout completed:", data);
      }}
    />
  );
}

if (currentPage === "profile") {
  return <CustomerProfile user={user} onBack={() => setCurrentPage("home")} />;
}

return (
  <CustomerHome
    user={user}
    onLogout={handleLogout}
    onNavigate={setCurrentPage}
  />
)};

export default CustomerDashboard;
