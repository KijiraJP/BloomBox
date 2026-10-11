import React, { useEffect, useState } from "react";
import "../bloombox.css";
import "./cart.css";

function Cart({ onBack, onCheckout }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [removingItemId, setRemovingItemId] = useState(null);

  useEffect(() => {
    const fetchCart = async () => {
      const token = sessionStorage.getItem("token");

      if (!token) {
        setError("No login session found.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:5000/api/cart",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || "Unable to load cart.");
          return;
        }

        setCart(data);

      } catch (err) {
        console.error("Cart error:", err);
        setError("Cannot connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    fetchCart();
  }, []);

  const formatPrice = (price) => {
    return Number(price).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const updateQuantity = async (cartItemId, newQuantity) => {
    if (newQuantity < 1) {
      return;
    }

    const token = sessionStorage.getItem("token");

    if (!token) {
      setError("No login session found.");
      return;
    }

    try {
      setError("");
      setUpdatingItemId(cartItemId);

      const response = await fetch(
        `http://localhost:5000/api/cart/items/${cartItemId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            quantity: newQuantity
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Quantity update error:", data);
        setError(data.message || "Unable to update quantity.");
        return;
      }

      // Refresh the cart after successful update
      const cartResponse = await fetch(
        "http://localhost:5000/api/cart",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const updatedCart = await cartResponse.json();

      if (!cartResponse.ok) {
        setError(
          updatedCart.message || "Unable to refresh cart."
        );
        return;
      }

      setCart(updatedCart);

    } catch (err) {
      console.error("Quantity update request error:", err);
      setError("Cannot connect to the server.");
    } finally {
      setUpdatingItemId(null);
    }
  };

    const removeItem = async (cartItemId) => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      setError("No login session found.");
      return;
    }

    try {
      setError("");
      setRemovingItemId(cartItemId);

      const response = await fetch(
        `http://localhost:5000/api/cart/items/${cartItemId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Remove item error:", data);
        setError(data.message || "Unable to remove item.");
        return;
      }

      // Refresh the cart after successful removal
      const cartResponse = await fetch(
        "http://localhost:5000/api/cart",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const updatedCart = await cartResponse.json();

      if (!cartResponse.ok) {
        setError(
          updatedCart.message || "Unable to refresh cart."
        );
        return;
      }

      setCart(updatedCart);

    } catch (err) {
      console.error("Remove item request error:", err);
      setError("Cannot connect to the server.");
    } finally {
      setRemovingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="cart-page">
        <section className="cart-hero">
          <div className="cart-hero-content">
            <p className="eyebrow">STEP 1 OF 3</p>

            <h1>Your shopping bag.</h1>

            <p>
              Loading your selected blooms...
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="cart-page">
        <section className="cart-hero">
          <div className="cart-hero-content">
            <p className="eyebrow">STEP 1 OF 3</p>

            <h1>Your shopping bag.</h1>

            <p>{error}</p>

            <button
              type="button"
              className="btn btn-dark"
              onClick={onBack}
            >
              ← Continue Shopping
            </button>
          </div>
        </section>
      </div>
    );
  }

  const items = cart?.items || [];
  const totalQuantity = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );

  return (
    <div className="cart-page">

      {/* HERO */}
      <section className="cart-hero">
        <div className="cart-hero-content">

          <button
            type="button"
            className="cart-back-button"
            onClick={onBack}
          >
            ← Continue Shopping
          </button>

          <p className="eyebrow">
            STEP 1 OF 3
          </p>

          <h1>
            Your shopping bag.
          </h1>

          <p>
            Review your blooms before continuing to checkout.
          </p>

        </div>
      </section>

      {/* CART CONTENT */}
      <section className="cart-section">

        {error && (
          <div className="cart-error-banner" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {items.length === 0 ? (

          <div className="cart-empty">

            <p className="eyebrow">
              YOUR BAG
            </p>

            <h2>
              Your bag is empty.
            </h2>

            <p>
              Looks like you haven't added any blooms yet.
            </p>

            <button
              type="button"
              className="btn btn-dark"
              onClick={onBack}
            >
              Shop the Collection
            </button>

          </div>

        ) : (

          <div className="cart-layout">

            {/* ITEMS */}
            <div className="cart-items">

              <div className="cart-items-header">
                <p>
                  {totalQuantity}{" "}
                  {totalQuantity === 1 ? "item" : "items"}
                </p>
              </div>

              {items.map((item) => (

                <article
                  className="cart-item"
                  key={item.cart_item_id}
                >

                  {/* IMAGE */}
                  <div className="cart-item-image">

                    {item.product_image ? (

                      <img
                        src={item.product_image}
                        alt={item.product_name}
                      />

                    ) : (

                      <img
                        src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=600&q=80"
                        alt={item.product_name}
                      />

                    )}

                  </div>

                  {/* INFORMATION */}
                  <div className="cart-item-info">

                    <p className="cart-item-type">
                      {item.category || "Flower"}
                    </p>

                    <h3>
                      {item.product_name}
                    </h3>

                    <p className="cart-item-option">
                      {item.size ? `Size: ${item.size}` : "One size"}
                    </p>

                    {item.wrap_style && (
                      <p className="cart-item-option">
                        Wrap: {item.wrap_style}
                      </p>
                    )}

                    {item.gift_message && (
                      <p className="cart-item-option cart-item-note">
                        Note: &ldquo;{item.gift_message}&rdquo;
                      </p>
                    )}

                    {/* QUANTITY CONTROLS */}
                    <div className="cart-quantity">

                      <span>
                        Quantity
                      </span>

                      <div className="cart-quantity-controls">

                        <button
                          type="button"
                          className="cart-quantity-button"
                          disabled={
                            updatingItemId === item.cart_item_id ||
                            item.quantity <= 1
                          }
                          onClick={() =>
                            updateQuantity(
                              item.cart_item_id,
                              item.quantity - 1
                            )
                          }
                        >
                          −
                        </button>

                        <span className="cart-quantity-value">
                          {updatingItemId === item.cart_item_id
                            ? "..."
                            : item.quantity}
                        </span>

                        <button
                          type="button"
                          className="cart-quantity-button"
                          disabled={
                            updatingItemId === item.cart_item_id ||
                            item.quantity >= Number(item.stock_quantity ?? 0)
                          }
                          onClick={() =>
                            updateQuantity(
                              item.cart_item_id,
                              item.quantity + 1
                            )
                          }
                        >
                          +
                        </button>

                      </div>

                    </div>
                    
                    <button
                        type="button"
                        className="cart-remove-button"
                        disabled={removingItemId === item.cart_item_id}
                        onClick={() => removeItem(item.cart_item_id)}
                    >
                        {removingItemId === item.cart_item_id
                        ? "Removing..."
                        : "Remove"}
                    </button>
                  </div>

                  {/* PRICE */}
                  <div className="cart-item-price">

                    <p>
                      ₱{formatPrice(item.subtotal)}
                    </p>

                    <span>
                      ₱{formatPrice(item.unit_price)} each
                    </span>

                  </div>

                </article>

              ))}

            </div>

            {/* SUMMARY */}
            <aside className="cart-summary">

              <p className="eyebrow">
                ORDER SUMMARY
              </p>

              <h2>
                Your total
              </h2>

              <div className="cart-summary-row">

                <span>
                  Subtotal
                </span>

                <span>
                  ₱{formatPrice(cart.subtotal)}
                </span>

              </div>

              <div className="cart-summary-row">

                <span>
                  Delivery
                </span>

                <span>
                  Calculated at checkout
                </span>

              </div>

              <div className="cart-summary-divider" />

              <div className="cart-summary-total">

                <span>
                  Total
                </span>

                <strong>
                  ₱{formatPrice(cart.total)}
                </strong>

              </div>

              <button
                type="button"
                className="btn btn-dark cart-checkout-button"
                onClick={onCheckout}
              >
                Continue to Checkout
              </button>

              <button
                type="button"
                className="cart-continue-button"
                onClick={onBack}
              >
                ← Continue Shopping
              </button>

            </aside>

          </div>

        )}

      </section>

    </div>
  );
}

export default Cart;

