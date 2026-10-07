import React, { useState } from "react";

import "../bloombox.css";
import "./product.css";

function ProductDetails({ product, onBack, onAddToCart, onGoToCart }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState("Medium");
  const [selectedWrap, setSelectedWrap] = useState("Kraft Paper");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("care");

  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

  const productImages = [
  product?.product_image ||
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1000&q=85",

  product?.product_image ||
    "https://images.unsplash.com/photo-1518709594023-6eab9bab7b23?auto=format&fit=crop&w=1000&q=85",

  product?.product_image ||
    "https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=1000&q=85",

  product?.product_image ||
    "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1000&q=85"
];

  if (!product) {
    return (
      <div>
        <h1>Product not found.</h1>

        <button
          type="button"
          onClick={onBack}
        >
          ← Back to Catalog
        </button>
      </div>
    );
  }

  const currentImage =
    productImages[selectedImage] || product.product_image;

  const increaseQuantity = () => {
    setQuantity((currentQuantity) => currentQuantity + 1);
  };

  const decreaseQuantity = () => {
    setQuantity((currentQuantity) =>
      Math.max(1, currentQuantity - 1)
    );
  };

  const handleAddToCart = async () => {
    const token = sessionStorage.getItem("token");

    if (!token) {
      setCartMessage("Please log in before adding items to your cart.");
      return;
    }

    if (!product?.product_id) {
      setCartMessage("Product information is missing.");
      return;
    }

    try {
      setAddingToCart(true);
      setCartMessage("");

      const response = await fetch(
        "http://localhost:5000/api/cart/items",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            product_id: product.product_id,
            quantity: quantity,
            size: selectedSize
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setCartMessage(
          data.message || "Unable to add product to cart."
        );
        return;
      }

      console.log("Cart API response:", data);

      setCartMessage("Added to cart successfully.");

      onGoToCart();

      if (onAddToCart) {
        onAddToCart({
          product_id: product.product_id,
          product_name: product.product_name,
          quantity,
          size: selectedSize,
          wrap_style: selectedWrap,
          message
        });
      }

    } catch (error) {
      console.error("Add to cart error:", error);

      setCartMessage(
        "Cannot connect to the server."
      );

    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <div>

      {/* TOP ANNOUNCEMENT */}
      <div className="announcement">
        FREE SAME-DAY DELIVERY ON SELECT ORDERS · METRO MANILA
      </div>

      {/* NAVBAR */}
      <header className="navbar">

        <button
          type="button"
          className="logo"
          onClick={onBack}
        >
          bloombox<span>.</span>
        </button>

        <nav>
          <button
            type="button"
            onClick={onBack}
          >
            Home
          </button>

          <button
            type="button"
            className="active"
            onClick={onBack}
          >
            Shop
          </button>

          <button type="button">
            Collections
          </button>

          <button type="button">
            Customize
          </button>

          <button type="button">
            About
          </button>

          <button type="button">
            Contact
          </button>
        </nav>

        <div className="nav-actions">

          <button type="button" aria-label="Search">
            🔍
          </button>

          <button type="button" aria-label="Wishlist">
            ♡
          </button>

          <button
            type="button"
            className="cart-button"
          >
            Bag <span>0</span>
          </button>

        </div>

      </header>

      {/* BREADCRUMB */}
      <nav className="breadcrumb">

        <button
          type="button"
          onClick={onBack}
        >
          Home
        </button>

        <span>/</span>

        <button
          type="button"
          onClick={onBack}
        >
          Shop
        </button>

        <span>/</span>

        <b>
          {product.product_name}
        </b>

      </nav>

      {/* PRODUCT DETAIL */}
      <section className="product-detail">

        {/* GALLERY */}
        <div className="gallery">

          <div className="gallery-main">

            <span className="tag">
              BEST SELLER
            </span>

            <button
              type="button"
              className="heart"
              aria-label="Add to wishlist"
            >
              ♡
            </button>

            {currentImage ? (
              <img
                src={currentImage}
                alt={product.product_name}
                id="mainImage"
              />
            ) : (
              <div className="product-image-placeholder">
                No image available
              </div>
            )}

          </div>

          <div className="gallery-thumbs">

            {productImages.map((image, index) => (
              <button
                type="button"
                className={
                  selectedImage === index
                    ? "thumb active"
                    : "thumb"
                }
                key={index}
                onClick={() => setSelectedImage(index)}
              >

                {image ? (
                  <img
                    src={image}
                    alt={`View ${index + 1}`}
                  />
                ) : (
                  <span>
                    {index + 1}
                  </span>
                )}

              </button>
            ))}

          </div>

        </div>

        {/* INFO */}
        <div className="product-info-panel">

          <span className="eyebrow">
            {product.category?.toUpperCase() || "BLOOMBOX"}
            {" · "}
            SIGNATURE COLLECTION
          </span>

          <h1>
            {product.product_name}
          </h1>

          {/* Rating */}
          <div className="rating-row">

            <span className="stars">
              ★★★★★
            </span>

            <span className="rating-count">
              5.0
            </span>

          </div>

          {/* Price */}
          <div className="price-row">

            <span className="price">
              ₱
              {Number(product.price).toLocaleString(
                "en-PH",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }
              )}
            </span>

          </div>

          {/* Description */}
          <p className="product-desc">

            {product.description ||
              "A beautiful BloomBox arrangement thoughtfully prepared for meaningful moments."}

          </p>

          {/* Includes */}
          <ul className="product-includes">

            <li>
              <span>❀</span>
              Freshly prepared BloomBox arrangement
            </li>

            <li>
              <span>❀</span>
              Carefully selected flowers
            </li>

            <li>
              <span>❀</span>
              Beautiful gift-ready wrapping
            </li>

            <li>
              <span>❀</span>
              Free care card included
            </li>

          </ul>

          {/* SIZE */}
          <div className="option-group">

            <h4>
              Size
            </h4>

            <div className="option-pills">

              {["Small", "Medium", "Large"].map(
                (size) => (
                  <button
                    type="button"
                    key={size}
                    className={
                      selectedSize === size
                        ? "option-pill active"
                        : "option-pill"
                    }
                    onClick={() =>
                      setSelectedSize(size)
                    }
                  >
                    {size}
                  </button>
                )
              )}

            </div>

          </div>

          {/* WRAP */}
          <div className="option-group">

            <h4>
              Wrap style
            </h4>

            <div className="option-pills">

              {[
                "Kraft Paper",
                "Satin Wrap",
                "Gift Box"
              ].map((wrap) => (
                <button
                  type="button"
                  key={wrap}
                  className={
                    selectedWrap === wrap
                      ? "option-pill active"
                      : "option-pill"
                  }
                  onClick={() =>
                    setSelectedWrap(wrap)
                  }
                >
                  {wrap}
                </button>
              ))}

            </div>

          </div>

          {/* MESSAGE */}
          <div className="option-group">

            <h4>
              Add a personal message{" "}
              <small>
                (optional)
              </small>
            </h4>

            <textarea
              className="message-input"
              placeholder="Write a short note to include with your gift..."
              maxLength="150"
              rows="3"
              value={message}
              onChange={(event) =>
                setMessage(event.target.value)
              }
            />

          </div>

          {/* QUANTITY + ADD TO BAG */}
          <div className="purchase-row">

            <div className="qty-selector">

              <button
                type="button"
                className="qty-btn minus"
                aria-label="Decrease quantity"
                onClick={decreaseQuantity}
              >
                −
              </button>

              <input
                type="text"
                className="qty-value"
                value={quantity}
                readOnly
              />

              <button
                type="button"
                className="qty-btn plus"
                aria-label="Increase quantity"
                onClick={increaseQuantity}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="btn btn-dark add-to-bag"
              onClick={handleAddToCart}
              disabled={addingToCart}
            >
              {addingToCart ? "Adding..." : "Add to Bag"}
              <span>→</span>
            </button>
          </div>

          {cartMessage && (
            <p className="cart-message">
              {cartMessage}
            </p>
          )}

          <button
            type="button"
            className="text-link buy-now"
          >
            Buy it now
          </button>

          {/* DELIVERY INFO */}
          <div className="delivery-info">

            <div className="delivery-info-item">

              <span>🚚</span>

              <div>

                <strong>
                  Same-day delivery
                </strong>

                <small>
                  Order before 2 PM for delivery today in Metro Manila.
                </small>

              </div>

            </div>

            <div className="delivery-info-item">

              <span>🎁</span>

              <div>

                <strong>
                  Gift-ready packaging
                </strong>

                <small>
                  Every order arrives beautifully wrapped, ready to give.
                </small>

              </div>

            </div>

            <div className="delivery-info-item">

              <span>↺</span>

              <div>

                <strong>
                  Freshness guarantee
                </strong>

                <small>
                  Not happy with your blooms? We'll make it right.
                </small>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* DETAILS TABS */}
      <section className="details-tabs">

        <div className="tabs-head">

          <button
            type="button"
            className={
              activeTab === "care"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() => setActiveTab("care")}
          >
            Flower Care
          </button>

          <button
            type="button"
            className={
              activeTab === "delivery"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() =>
              setActiveTab("delivery")
            }
          >
            Delivery Info
          </button>

          <button
            type="button"
            className={
              activeTab === "reviews"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() => setActiveTab("reviews")}
          >
            Reviews
          </button>

        </div>

        {activeTab === "care" && (
          <div className="tab-panel active">

            <p>
              Trim stems at an angle every two to three
              days and change the water regularly to keep
              your bouquet fresh. Keep away from direct
              sunlight, heaters, and ripening fruit.
            </p>

          </div>
        )}

        {activeTab === "delivery" && (
          <div className="tab-panel active">

            <p>
              Same-day delivery is available for selected
              locations. Orders placed after the cutoff or
              outside the coverage area may be scheduled
              for the next available delivery period.
            </p>

          </div>
        )}

        {activeTab === "reviews" && (
          <div className="tab-panel active">

            <div className="review-layout">

              <div className="quote-mark">
                "
              </div>

              <blockquote>
                The bouquet was even more beautiful in
                person. Every little detail felt incredibly
                thoughtful.

                <cite>
                  BloomBox customer
                </cite>
              </blockquote>

              <div className="review-number">
                01
              </div>

            </div>

          </div>
        )}

      </section>

      {/* YOU MAY ALSO LIKE */}
      <section className="section related">

        <div className="section-heading">

          <div>

            <div className="section-label">
              COMPLETE THE MOMENT
            </div>

            <h2>
              You may also <em>like.</em>
            </h2>

          </div>

          <button
            type="button"
            className="outline-link"
            onClick={onBack}
          >
            View all flowers
          </button>

        </div>

      </section>

    </div>
  );
}

export default ProductDetails;