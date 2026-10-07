import React, { useEffect, useState } from "react";

import "../bloombox.css";
import "./catalog.css";

function Catalog({ onBack, onProductSelect }) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedAvailability, setSelectedAvailability] = useState("All");

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

  // Filter products
  const filteredProducts = products.filter((product) => {
    const categoryMatches =
      selectedCategory === "All" ||
      product.category === selectedCategory;

    const availabilityMatches =
      selectedAvailability === "All" ||
      product.status === "active";

    return categoryMatches && availabilityMatches;
  });

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

            <button
              type="button"
              className={
                selectedCategory === "All"
                  ? "filter-option active"
                  : "filter-option"
              }
              onClick={() => setSelectedCategory("All")}
            >
              All Products
            </button>

            <button
              type="button"
              className={
                selectedCategory === "Bouquet"
                  ? "filter-option active"
                  : "filter-option"
              }
              onClick={() => setSelectedCategory("Bouquet")}
            >
              Bouquets
            </button>

            <button
              type="button"
              className={
                selectedCategory === "Flower"
                  ? "filter-option active"
                  : "filter-option"
              }
              onClick={() => setSelectedCategory("Flower")}
            >
              Flowers
            </button>

          </div>

          <div className="filter-group">

            <h3>Availability</h3>

            <button
              type="button"
              className={
                selectedAvailability === "All"
                  ? "filter-option active"
                  : "filter-option"
              }
              onClick={() =>
                setSelectedAvailability("All")
              }
            >
              All
            </button>

            <button
              type="button"
              className={
                selectedAvailability === "In Stock"
                  ? "filter-option active"
                  : "filter-option"
              }
              onClick={() =>
                setSelectedAvailability("In Stock")
              }
            >
              In Stock
            </button>

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

            <div className="catalog-chips">

              <button
                type="button"
                className={
                  selectedCategory === "All"
                    ? "catalog-chip active"
                    : "catalog-chip"
                }
                onClick={() => setSelectedCategory("All")}
              >
                All
              </button>

              <button
                type="button"
                className={
                  selectedCategory === "Bouquet"
                    ? "catalog-chip active"
                    : "catalog-chip"
                }
                onClick={() =>
                  setSelectedCategory("Bouquet")
                }
              >
                Bouquets
              </button>

              <button
                type="button"
                className={
                  selectedCategory === "Flower"
                    ? "catalog-chip active"
                    : "catalog-chip"
                }
                onClick={() =>
                  setSelectedCategory("Flower")
                }
              >
                Flowers
              </button>

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
                      ₱
                      {Number(product.price).toLocaleString(
                        "en-PH",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }
                      )}
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
                  Try changing your filter.
                </p>
              </div>
            )}

        </div>

      </section>

    </div>
  );
}

export default Catalog;