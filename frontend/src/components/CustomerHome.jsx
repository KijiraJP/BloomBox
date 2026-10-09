import React, { useEffect, useState } from "react";
import "../bloombox.css";

function CustomerHome({ user, cartCount = 0, onLogout, onNavigate, onProductSelect }) {
  const [featuredProducts, setFeaturedProducts] = useState([]);

  // Live products for the "Best-loved blooms" section
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/products");
        const data = await response.json();

        if (!response.ok) {
          return;
        }

        setFeaturedProducts(data.slice(0, 3));
      } catch (error) {
        console.error("Featured products error:", error);
      }
    };

    fetchProducts();
  }, []);

  const formatPrice = (price) => {
    const value = Number(price);
    const safeValue = Number.isFinite(value) ? value : 0;

    return safeValue.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="customer-home">

      {/* Announcement Bar */}
      <div className="announcement">
        <p>
          Same-day delivery available for selected locations.
        </p>
      </div>

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-brand">
          <h2>BloomBox</h2>
          <span>FLORALS</span>
        </div>

        <div className="nav-links">
          <a href="#home">Home</a>
          <button
            type="button"
            onClick={() => onNavigate("catalog")}
            >
            Shop
            </button>
          <button
            type="button"
            onClick={() => onNavigate("cart")}
            >
            Cart{cartCount > 0 ? ` (${cartCount})` : ""}
            </button>
          <a href="#bouquet">Create Your Bouquet</a>
          <a href="#delivery">Delivery</a>
        </div>

        <div className="nav-actions">
          <button
            className="nav-account"
            type="button"
            onClick={() => onNavigate("profile")}
          >
            {user?.first_name || "Account"}
          </button>

          <button
            className="nav-logout"
            type="button"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main>

        <section className="hero" id="home">
          <div className="hero-content">

            <p className="eyebrow">
              FLOWERS FOR EVERY MOMENT
            </p>

            <h1>
              Thoughtfully arranged.
              <br />
              Beautifully delivered.
            </h1>

            <p className="hero-description">
              Discover fresh blooms, thoughtful gifts, and
              beautiful bouquets made to make every moment
              feel special.
            </p>

            <div className="hero-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate("catalog")}
              >
                Shop the Collection
              </button>

              <a
                href="#bouquet"
                className="btn btn-outline"
              >
                Create Your Bouquet
              </a>
            </div>

          </div>

          <div className="hero-image">
            <img
              src="https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1200&q=80"
              alt="Beautiful pink flowers"
            />
          </div>
        </section>

        {/* Trust Row */}
        <section className="trust-row">

          <div className="trust-item">
            <strong>Fresh Daily</strong>
            <span>Beautiful blooms selected with care.</span>
          </div>

          <div className="trust-item">
            <strong>Same-Day Delivery</strong>
            <span>Available for selected locations.</span>
          </div>

          <div className="trust-item">
            <strong>Made With Love</strong>
            <span>Every bouquet is carefully prepared.</span>
          </div>

        </section>

        {/* About */}
        <section className="section about-section">

          <div className="section-image">
            <img
              src="https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1000&q=80"
              alt="Fresh flowers"
            />
          </div>

          <div className="section-content">

            <p className="eyebrow">
              WELCOME TO BLOOMBOX
            </p>

            <h2>
              Flowers that say
              <br />
              what words cannot.
            </h2>

            <p>
              Whether you're celebrating a birthday, saying
              thank you, expressing love, or simply brightening
              someone's day, BloomBox helps you find the perfect
              arrangement.
            </p>

            <p>
              Choose from our collection or create something
              uniquely yours with our custom bouquet experience.
            </p>

            <button
              type="button"
              className="text-link"
              onClick={() => onNavigate("catalog")}
            >
              Explore our collection →
            </button>

          </div>

        </section>

        {/* Collections */}
        <section className="section collections-section" id="shop">

          <div className="section-heading">
            <p className="eyebrow">
              SHOP BY OCCASION
            </p>

            <h2>
              Something beautiful
              <br />
              for every moment.
            </h2>
          </div>

          <div className="category-grid">

            <article
              className="category-card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("catalog")}
            >
              <img
                src="https://images.unsplash.com/photo-1494336934270-15c0c5c4d1f2?auto=format&fit=crop&w=800&q=80"
                alt="Romantic flowers"
              />
              <div>
                <h3>Love & Romance</h3>
                <p>For the moments that matter most.</p>
              </div>
            </article>

            <article
              className="category-card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("catalog")}
            >
              <img
                src="https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=800&q=80"
                alt="Birthday flowers"
              />
              <div>
                <h3>Birthday</h3>
                <p>Make their special day bloom.</p>
              </div>
            </article>

            <article
              className="category-card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate("catalog")}
            >
              <img
                src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80"
                alt="Thank you flowers"
              />
              <div>
                <h3>Thank You</h3>
                <p>A thoughtful way to show appreciation.</p>
              </div>
            </article>

          </div>

        </section>

        {/* Featured Products */}
        {featuredProducts.length > 0 && (
        <section className="section products-section">

          <div className="section-heading">
            <p className="eyebrow">
              OUR FAVORITES
            </p>

            <h2>
              Best-loved blooms.
            </h2>
          </div>

          <div className="product-grid">

            {featuredProducts.map((product) => (
              <article
                className="product-card"
                key={product.product_id}
                style={{ cursor: "pointer" }}
                onClick={() =>
                  onProductSelect && onProductSelect(product)
                }
              >
                {product.product_image ? (
                  <img
                    src={product.product_image}
                    alt={product.product_name}
                  />
                ) : (
                  <img
                    src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80"
                    alt={product.product_name}
                  />
                )}

                <div className="product-info">
                  <h3>{product.product_name}</h3>
                  <p>{product.description || product.category}</p>
                  <strong>₱{formatPrice(product.price)}</strong>
                </div>
              </article>
            ))}

          </div>

        </section>
        )}

        {/* Custom Bouquet */}
        <section
          className="custom-bouquet"
          id="bouquet"
        >

          <div className="custom-bouquet-content">

            <p className="eyebrow">
              MAKE IT YOURS
            </p>

            <h2>
              Create your own
              <br />
              beautiful bouquet.
            </h2>

            <p>
              Pick your favorite blooms, choose your wrapping,
              and create an arrangement made especially for
              someone you love.
            </p>

            <a
              href="#bouquet"
              className="btn btn-primary"
            >
              Create Your Bouquet
            </a>

          </div>

          <div className="custom-bouquet-image">
            <img
              src="https://images.unsplash.com/photo-1523694576729-dc99e8d2fdd3?auto=format&fit=crop&w=1000&q=80"
              alt="Custom flower bouquet"
            />
          </div>

        </section>

        {/* Flower Care */}
        <section className="flower-care section">

          <div>
            <p className="eyebrow">
              KEEP THEM BLOOMING
            </p>

            <h2>
              A little care goes
              <br />
              a long way.
            </h2>
          </div>

          <p>
            Every BloomBox arrangement comes with flower-care
            guidance to help your blooms stay beautiful for
            longer.
          </p>

        </section>

        {/* Reviews */}
        <section className="section reviews-section">

          <div className="section-heading">
            <p className="eyebrow">
              CUSTOMER LOVE
            </p>

            <h2>
              Kind words from our customers.
            </h2>
          </div>

          <div className="review-card">

            <p className="review-text">
              “The flowers were beautiful and arrived exactly
              when I needed them. The whole experience was
              effortless.”
            </p>

            <strong>
              BloomBox Customer
            </strong>

          </div>

        </section>

        {/* Delivery */}
        <section
          className="section delivery-section"
          id="delivery"
        >

          <div className="section-heading">
            <p className="eyebrow">
              DELIVERY MADE SIMPLE
            </p>

            <h2>
              Beautiful flowers,
              <br />
              right when you need them.
            </h2>
          </div>

          <div className="delivery-grid">

            <div className="delivery-card">
              <h3>Choose Your Date</h3>
              <p>
                Schedule your delivery according to your
                preferred date.
              </p>
            </div>

            <div className="delivery-card">
              <h3>Select Your Time</h3>
              <p>
                Choose an available delivery time for your order.
              </p>
            </div>

            <div className="delivery-card">
              <h3>Track Your Order</h3>
              <p>
                Follow your order from preparation to delivery.
              </p>
            </div>

          </div>

        </section>

        {/* CTA */}
        <section className="cta-section">

          <p className="eyebrow">
            READY TO BLOOM?
          </p>

          <h2>
            Send a little
            <br />
            happiness today.
          </h2>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate("catalog")}
          >
            Shop Flowers
          </button>

        </section>

      </main>

      {/* Footer */}
      <footer className="footer">

        <div className="footer-brand">
          <h2>BloomBox</h2>
          <p>
            Thoughtfully arranged. Beautifully delivered.
          </p>
        </div>

        <div className="footer-links">
          <button
            type="button"
            onClick={() => onNavigate("catalog")}
            >
            Shop
            </button>
          <a href="#bouquet">Create a Bouquet</a>
          <a href="#delivery">Delivery</a>
        </div>

        <div className="footer-account">
          <p>
            Signed in as:
          </p>

          <strong>
            {user?.email}
          </strong>

          <button
            type="button"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>

      </footer>

    </div>
  );
}

export default CustomerHome;
