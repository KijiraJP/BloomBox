import React, { useEffect, useState } from "react";

import "../bloombox.css";
import "./catalog.css";

function Catalog({ onBack, onProductSelect }) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedAvailability, setSelectedAvailability] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch products from the BloomBox backend
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "http://localhost:5000/api/products"
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load products."
          );
        }

        setProducts(data);
      } catch (err) {
        console.error("Catalog product error:", err);
        setError("Unable to load products.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Category buttons come from the data itself so new categories
  // added by the admin show up automatically.
  const categories = React.useMemo(() => {
    const unique = [...new Set(products.map((product) => product.category))];
    return ["All", ...unique.filter(Boolean)];
  }, [products]);

  // Filter products
  const filteredProducts = products.filter((product) => {
    const categoryMatches =
      selectedCategory === "All" ||
      product.category === selectedCategory;

    const stockQuantity = Number(product.stock_quantity ?? 0);
    const availabilityMatches =
      selectedAvailability === "All" ||
      (selectedAvailability === "In Stock" && stockQuantity > 0) ||
      (selectedAvailability === "Out of Stock" && stockQuantity <= 0);

    const query = searchQuery.trim().toLowerCase();
    const searchMatches =
      !query ||
      product.product_name.toLowerCase().includes(query) ||
      (product.description || "").toLowerCase().includes(query);

    return categoryMatches && availabilityMatches && searchMatches;
  });

  const formatPrice = (price) => {
    const value = Number(price);
    const safeValue = Number.isFinite(value) ? value : 0;

    return safeValue.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="catalog-page">

      {/* Catalog Header */}
      <section className="catalog-hero">

        <div className="catalog-hero-content">

          <button
            type="button"
            className="catalog-back-button"
            onClick={onBack}
          >
            ← Back to Home
          </button>

          <p className="eyebrow">
            THE FULL COLLECTION
          </p>

          <h1>
            Shop all blooms.
          </h1>

          <p>
            Explore our collection of thoughtfully arranged
            flowers and beautiful bouquets.
          </p>

        </div>

      </section>

      {/* Catalog Content */}
      <section className="catalog-section">

        {/* Sidebar */}
        <aside className="catalog-sidebar">

          <div className="filter-group">

            <h3>Category</h3>

            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={
                  selectedCategory === category
                    ? "filter-option active"
                    : "filter-option"
                }
                onClick={() => setSelectedCategory(category)}
              >
                {category === "All" ? "All Products" : category}
              </button>
            ))}

          </div>

          <div className="filter-group">

            <h3>Availability</h3>

            {["All", "In Stock", "Out of Stock"].map((option) => (
              <button
                type="button"
                key={option}
                className={
                  selectedAvailability === option
                    ? "filter-option active"
                    : "filter-option"
                }
                onClick={() => setSelectedAvailability(option)}
              >
                {option}
              </button>
            ))}

          </div>

        </aside>

        {/* Product Results */}
        <div className="catalog-results">

          <div className="catalog-results-header">

            <div>
              <p className="catalog-results-count">
                {loading
                  ? "Loading products..."
                  : `${filteredProducts.length} products`}
              </p>
            </div>

            <input
              type="search"
              className="catalog-search"
              placeholder="Search flowers..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search products"
            />

            <div className="catalog-chips">

              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  className={
                    selectedCategory === category
                      ? "catalog-chip active"
                      : "catalog-chip"
                  }
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}

            </div>

          </div>

          {/* Loading */}
          {loading && (
            <div className="catalog-empty">
              <h3>Loading flowers...</h3>
              <p>
                Please wait while we load our collection.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="catalog-empty">
              <h3>Unable to load flowers.</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Products */}
          {!loading && !error && (
            <div className="catalog-product-grid">

              {filteredProducts.map((product) => (
                <article
                  className="catalog-product-card"
                  key={product.product_id}
                >

                  <button
                    type="button"
                    className="catalog-product-image"
                    onClick={() =>
                      onProductSelect(product)
                    }
                  >

                    {product.product_image ? (
                      <img
                        src={product.product_image}
                        alt={product.product_name}
                      />
                    ) : (
                      <div className="catalog-image-placeholder">
                        No image
                      </div>
                    )}

                  </button>

                  <div className="catalog-product-info">

                    <p className="catalog-product-type">
                      {product.category}
                    </p>

                    <h3>
                      {product.product_name}
                    </h3>

                    <p className="catalog-product-price">
                      ₱{formatPrice(product.price)}
                    </p>

                    <p
                      className={
                        Number(product.stock_quantity ?? 0) > 0
                          ? "catalog-product-stock"
                          : "catalog-product-stock out"
                      }
                    >
                      {Number(product.stock_quantity ?? 0) > 0
                        ? `${product.stock_quantity} in stock`
                        : "Out of stock"}
                    </p>

                    <button
                      type="button"
                      className="catalog-view-button"
                      onClick={() =>
                        onProductSelect(product)
                      }
                    >
                      View Product
                    </button>

                  </div>

                </article>
              ))}

            </div>
          )}

          {/* No Products */}
          {!loading &&
            !error &&
            filteredProducts.length === 0 && (
              <div className="catalog-empty">
                <h3>No products found.</h3>
                <p>
                  Try changing your filter or search.
                </p>
              </div>
            )}

        </div>

      </section>

    </div>
  );
}

export default Catalog;