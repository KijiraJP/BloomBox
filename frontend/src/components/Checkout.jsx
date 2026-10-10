import React, { useEffect, useState } from "react";
import "../bloombox.css";
import "./checkout.css";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nowLocal = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function Checkout({ onBack, onContinue }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [mobileNumber, setMobileNumber] = useState("");

  const [street, setStreet] = useState("");
  const [barangay, setBarangay] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [landmark, setLandmark] = useState("");

  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [checkoutData, setCheckoutData] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);
  const [gatewayMessage, setGatewayMessage] = useState("");

  // Tracks what has already been created so a retry after a mid-checkout
  // failure can never create a duplicate address, order, or delivery.
  const [createdAddress, setCreatedAddress] = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [createdDelivery, setCreatedDelivery] = useState(null);

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
        console.error("Checkout cart error:", err);
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

  const clearCodCartItems = async (orderId, token) => {
    const response = await fetch(
      `http://localhost:5000/api/cart/order/${orderId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to clear checked-out cart items.");
    }
  };

  const handleTestPayment = async () => {
  const token = sessionStorage.getItem("token");

  if (!token) {
    setError("Your login session has expired. Please log in again.");
    return;
  }

  if (!paymentInfo?.payment_id) {
    setError("No payment was created for this order.");
    return;
  }

  try {
    setPaymentProcessing(true);
    setError("");

    const response = await fetch(
      `http://localhost:5000/api/payments/${paymentInfo.payment_id}/status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_status: "successful",
          transaction_reference: `TEST-GCASH-${paymentInfo.payment_id}`
        })
      }
    );

    const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ||
          "Payment could not be completed."
        );
        return;
      }

      console.log("Payment successful:", data);

      setPaymentResult(data);

      onContinue({
        ...checkoutData,
      paymentResult: data
    });

  } catch (error) {
    console.error("Payment error:", error);

    setError(
      "Cannot connect to the server while processing payment."
    );
  } finally {
    setPaymentProcessing(false);
  }
};
  
  const handleContinue = async (event) => {
  event.preventDefault();

  const token = sessionStorage.getItem("token");

  if (!token) {
    setError("Your login session has expired. Please log in again.");
    return;
  }

  try {
    setError("");

    const items = cart?.items || [];

    if (items.length === 0) {
      setError("Your bag is empty. Add some blooms before checking out.");
      return;
    }

    // -----------------------------------
    // STEP 1 — Save delivery address
    // -----------------------------------

    let addressId = createdAddress?.address_id;

    if (!addressId) {
      const addressResponse = await fetch(
        "http://localhost:5000/api/addresses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            street: street.trim(),
            barangay: barangay.trim(),
            city: city.trim(),
            postalCode: postalCode.trim(),
            landmark: landmark.trim()
          })
        }
      );

      const addressData = await addressResponse.json();

      if (!addressResponse.ok) {
        setError(
          addressData.message ||
          "Unable to save delivery address."
        );
        return;
      }

      addressId = addressData.address.address_id;
      setCreatedAddress(addressData.address);

      console.log(
        "Address saved:",
        addressData.address
      );
    }

    // -----------------------------------
    // STEP 2 — Create the order
    // -----------------------------------

    let orderData = createdOrder;

    if (!orderData) {
      const orderResponse = await fetch(
        "http://localhost:5000/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            address_id: addressId
          })
        }
      );

      orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        setError(
          orderData.message ||
          "Unable to create your order."
        );
        return;
      }

      setCreatedOrder(orderData);

      console.log(
        "Order created:",
        orderData
      );
    }

    // -----------------------------------
    // STEP 3 — Save the requested delivery schedule
    // -----------------------------------

    let deliveryData = createdDelivery
      ? { delivery: createdDelivery }
      : null;

    if (!deliveryData) {
      const deliveryResponse = await fetch(
        "http://localhost:5000/api/deliveries",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: orderData.order_id,
            delivery_date: deliveryDate,
            delivery_time: deliveryTime
          })
        }
      );

      deliveryData = await deliveryResponse.json();

      if (!deliveryResponse.ok) {
        setError(
          deliveryData.message ||
          "Unable to save your delivery schedule."
        );
        return;
      }

      setCreatedDelivery(deliveryData.delivery);

      console.log("Delivery schedule saved:", deliveryData.delivery);
    }

    // -----------------------------------
    // STEP 4 — Create payment attempt
    // -----------------------------------

    const paymentResponse = await fetch(
      "http://localhost:5000/api/payments",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: orderData.order_id,
          payment_method: paymentMethod
        })
      }
    );

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      setError(
        paymentData.message ||
        "Unable to create payment."
      );
      return;
    }

    console.log(
      "Payment created:",
      paymentData
    );

    if (paymentMethod === "cod") {
      try {
        await clearCodCartItems(orderData.order_id, token);
      } catch (clearError) {
        // Non-fatal: the order already exists. Turning this into an
        // error screen would let the customer retry and create a
        // duplicate order - leftover bag items are the lesser problem.
        console.error("Cart clear warning:", clearError);
      }
    }

    // -----------------------------------
    // STEP 5 — Send checkout data upward
    // -----------------------------------

    const newCheckoutData = {
    email,
    mobileNumber,
    address: { address_id: addressId },
    deliveryDate,
    deliveryTime,
    delivery: deliveryData.delivery,
    paymentMethod,
    order: orderData,
    payment: paymentData
  };

  setCheckoutData(newCheckoutData);
  setPaymentInfo(paymentData);

  console.log(
    "Checkout ready for payment:",
    newCheckoutData
  );

  } catch (error) {
    console.error(
      "Checkout error:",
      error
    );

    setError(
      "Cannot connect to the server. Please try again."
    );
  }
};

  const handleTestPaymentFailure = async () => {
    const token = sessionStorage.getItem("token");

    if (!token || !paymentInfo?.payment_id) {
      setError("Your login session has expired. Please log in again.");
      return;
    }

    try {
      setPaymentProcessing(true);
      setError("");

      const response = await fetch(
        `http://localhost:5000/api/payments/${paymentInfo.payment_id}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            payment_status: "failed",
            transaction_reference: `TEST-FAILED-${paymentInfo.payment_id}`
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Payment could not be marked as failed.");
        return;
      }

      setPaymentInfo((currentPayment) => ({
        ...currentPayment,
        ...data
      }));
    } catch (error) {
      console.error("Payment failure test error:", error);
      setError("Cannot connect to the server while updating payment status.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleRetryPayment = async () => {
    const token = sessionStorage.getItem("token");

    if (!token || !paymentInfo?.order_id || !paymentInfo?.payment_method) {
      setError("Payment details are unavailable. Please try checkout again.");
      return;
    }

    try {
      setPaymentProcessing(true);
      setError("");

      const response = await fetch(
        "http://localhost:5000/api/payments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            order_id: paymentInfo.order_id,
            payment_method: paymentInfo.payment_method
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "A new payment attempt could not be created.");
        return;
      }

      setPaymentInfo(data);
    } catch (error) {
      console.error("Payment retry error:", error);
      setError("Cannot connect to the server while creating a new payment attempt.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  const startGatewayPayment = async () => {
    const token = sessionStorage.getItem("token");

    if (!token || !paymentInfo?.payment_id) {
      setGatewayMessage("Payment details are unavailable. Please try checkout again.");
      return;
    }

    try {
      setPaymentProcessing(true);
      setGatewayMessage("");

      const response = await fetch(
        `http://localhost:5000/api/payments/${paymentInfo.payment_id}/xendit/invoice`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();

      if (!response.ok) {
        setGatewayMessage(data.message || "Could not start the online payment.");
        return;
      }

      setPaymentInfo((currentPayment) => ({ ...currentPayment, ...data }));

      window.open(data.checkout_url, "_blank", "noopener");
    } catch (error) {
      console.error("Gateway payment error:", error);
      setGatewayMessage("Cannot connect to the server while starting payment.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  const verifyGatewayPayment = async () => {
    const token = sessionStorage.getItem("token");

    if (!token || !paymentInfo?.payment_id) {
      setGatewayMessage("Payment details are unavailable. Please try checkout again.");
      return;
    }

    try {
      setPaymentProcessing(true);
      setGatewayMessage("");

      const response = await fetch(
        `http://localhost:5000/api/payments/${paymentInfo.payment_id}/xendit/verify`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();

      if (!response.ok) {
        setGatewayMessage(data.message || "Could not verify the payment.");
        return;
      }

      if (data.payment_status === "successful") {
        setPaymentResult(data);
        onContinue({ ...checkoutData, paymentResult: data });
        return;
      }

      setPaymentInfo((currentPayment) => ({ ...currentPayment, ...data }));
      setGatewayMessage(
        data.message ||
        "Payment is still pending. Complete the payment, then verify again."
      );
    } catch (error) {
      console.error("Gateway verification error:", error);
      setGatewayMessage("Cannot connect to the server while verifying payment.");
    } finally {
      setPaymentProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">STEP 2 OF 3</p>
            <h1>Almost there.</h1>
            <p>Loading your order...</p>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">STEP 2 OF 3</p>
            <h1>Unable to continue.</h1>
            <p>{error}</p>

            <button
              type="button"
              className="btn btn-dark"
              onClick={onBack}
            >
              ← Back to Cart
            </button>
          </div>
        </section>
      </div>
    );
  }

  const items = cart?.items || [];

  if (paymentResult) {
    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">ORDER CONFIRMED</p>
            <h1>Payment successful.</h1>
            <p>
              Thank you. Your order has been confirmed and will be prepared for delivery.
            </p>
          </div>
        </section>

        <section className="checkout-section">
          <div className="checkout-layout">
            <div className="checkout-main">
              <section className="checkout-card">
                <p className="eyebrow">YOUR CONFIRMATION</p>
                <h2>Order #{paymentResult.order_id}</h2>
                <div className="checkout-summary-row">
                  <span>Payment status</span>
                  <strong>{paymentResult.payment_status}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Order status</span>
                  <strong>{paymentResult.order_status}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Payment reference</span>
                  <strong>{paymentResult.transaction_reference}</strong>
                </div>

                <button
                  type="button"
                  className="btn btn-dark checkout-continue-button"
                  onClick={onBack}
                >
                  Continue Shopping
                </button>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (paymentInfo?.payment_method === "cod") {
    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">ORDER RECEIVED</p>
            <h1>Cash on Delivery selected.</h1>
            <p>
              Your order is pending confirmation. Please prepare the exact amount
              for payment when your delivery arrives.
            </p>
          </div>
        </section>

        <section className="checkout-section">
          <div className="checkout-layout">
            <div className="checkout-main">
              <section className="checkout-card">
                <p className="eyebrow">COD ORDER DETAILS</p>
                <h2>Order #{paymentInfo.order_id}</h2>
                <div className="checkout-summary-row">
                  <span>Amount due on delivery</span>
                  <strong>₱{formatPrice(paymentInfo.amount)}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Order status</span>
                  <strong>pending confirmation</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Payment status</span>
                  <strong>pending on delivery</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Requested delivery</span>
                  <strong>
                    {checkoutData.deliveryDate} at {checkoutData.deliveryTime}
                  </strong>
                </div>

                <button
                  type="button"
                  className="btn btn-dark checkout-continue-button"
                  onClick={onBack}
                >
                  Continue Shopping
                </button>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (paymentInfo?.payment_status === "failed") {
    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">PAYMENT NOT COMPLETED</p>
            <h1>Your payment attempt failed.</h1>
            <p>
              Your order is still pending. You can create a new payment attempt
              without creating another order.
            </p>
          </div>
        </section>

        <section className="checkout-section">
          <div className="checkout-layout">
            <div className="checkout-main">
              <section className="checkout-card">
                <p className="eyebrow">RETRY PAYMENT</p>
                <h2>Order #{paymentInfo.order_id}</h2>
                <div className="checkout-summary-row">
                  <span>Failed attempt</span>
                  <strong>#{paymentInfo.attempt_number}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Amount</span>
                  <strong>₱{formatPrice(paymentInfo.amount)}</strong>
                </div>

                <button
                  type="button"
                  className="btn btn-dark checkout-continue-button"
                  onClick={handleRetryPayment}
                  disabled={paymentProcessing}
                >
                  {paymentProcessing ? "Creating retry..." : "Try Payment Again"}
                </button>

                <button
                  type="button"
                  className="btn checkout-continue-button"
                  onClick={onBack}
                >
                  ← Back to Cart
                </button>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (paymentInfo) {
    const invoiceReady = Boolean(paymentInfo.gateway_invoice_id);

    return (
      <div className="checkout-page">
        <section className="checkout-hero">
          <div className="checkout-hero-content">
            <p className="eyebrow">STEP 3 OF 3</p>
            <h1>Complete your payment.</h1>
            <p>
              Pay securely with GCash, Maya, or a card through Xendit, then
              verify your payment here.
            </p>
          </div>
        </section>

        <section className="checkout-section">
          <div className="checkout-layout">
            <div className="checkout-main">
              <section className="checkout-card">
                <p className="eyebrow">ONLINE PAYMENT</p>
                <h2>Payment pending</h2>
                <div className="checkout-summary-row">
                  <span>Order</span>
                  <strong>#{paymentInfo.order_id}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Payment method</span>
                  <strong>{paymentInfo.payment_method.replace("_", " ")}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Amount</span>
                  <strong>₱{formatPrice(paymentInfo.amount)}</strong>
                </div>
                <div className="checkout-summary-row">
                  <span>Status</span>
                  <strong>
                    {paymentInfo.gateway_status || paymentInfo.payment_status}
                  </strong>
                </div>

                {!invoiceReady ? (
                  <button
                    type="button"
                    className="btn btn-dark checkout-continue-button"
                    onClick={startGatewayPayment}
                    disabled={paymentProcessing}
                  >
                    {paymentProcessing ? "Starting payment..." : "Pay with Xendit"}
                  </button>
                ) : (
                  <>
                    <a
                      className="btn btn-dark checkout-continue-button"
                      href={paymentInfo.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open payment page
                    </a>

                    <button
                      type="button"
                      className="btn checkout-continue-button"
                      onClick={verifyGatewayPayment}
                      disabled={paymentProcessing}
                    >
                      {paymentProcessing ? "Verifying..." : "I have completed payment — Verify"}
                    </button>
                  </>
                )}

                {gatewayMessage && (
                  <p className="checkout-schedule-note">{gatewayMessage}</p>
                )}

                <hr />

                <p className="eyebrow">DEVELOPER FALLBACK</p>

                <button
                  type="button"
                  className="btn checkout-continue-button"
                  onClick={handleTestPayment}
                  disabled={paymentProcessing}
                >
                  Complete Test Payment
                </button>

                <button
                  type="button"
                  className="btn checkout-continue-button"
                  onClick={handleTestPaymentFailure}
                  disabled={paymentProcessing}
                >
                  Simulate Test Failure
                </button>

                <button
                  type="button"
                  className="btn checkout-continue-button"
                  onClick={onBack}
                >
                  ← Back to Cart
                </button>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="checkout-page">

      <section className="checkout-hero">
        <div className="checkout-hero-content">

          <button
            type="button"
            className="checkout-back-button"
            onClick={onBack}
          >
            ← Back to Cart
          </button>

          <p className="eyebrow">STEP 2 OF 3</p>

          <h1>Almost there.</h1>

          <p>
            Enter your delivery details and review your order.
          </p>

        </div>
      </section>

      <form
        className="checkout-section"
        onSubmit={handleContinue}
      >

        <div className="checkout-layout">

          <div className="checkout-main">

            {/* CONTACT */}

            <section className="checkout-card">

              <p className="eyebrow">
                01 — CONTACT
              </p>

              <h2>
                Contact information
              </h2>

              <div className="checkout-form-grid">

                <div className="checkout-field">

                  <label htmlFor="checkout-email">
                    Email
                  </label>

                  <input
                    id="checkout-email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="your@email.com"
                    required
                  />

                </div>

                <div className="checkout-field">

                  <label htmlFor="checkout-phone">
                    Mobile number
                  </label>

                  <input
                    id="checkout-phone"
                    type="tel"
                    value={mobileNumber}
                    onChange={(event) =>
                      setMobileNumber(event.target.value)
                    }
                    placeholder="09XXXXXXXXX"
                    required
                  />

                </div>

              </div>

            </section>


            {/* DELIVERY */}

            <section className="checkout-card">

              <p className="eyebrow">
                02 — DELIVERY
              </p>

              <h2>
                Delivery address
              </h2>

              <div className="checkout-field">

                <label htmlFor="checkout-address">
                  Complete address
                </label>

                <textarea
                  id="checkout-address"
                  rows="4"
                  value={street}
                  onChange={(event) =>
                    setStreet(event.target.value)
                  }
                  placeholder="House number, street..."
                  required
                />

              </div>

              <div className="checkout-form-grid">

                <div className="checkout-field">

                  <label htmlFor="checkout-barangay">
                    Barangay
                  </label>

                  <input
                    id="checkout-barangay"
                    type="text"
                    value={barangay}
                    onChange={(event) =>
                      setBarangay(event.target.value)
                    }
                    placeholder="Barangay"
                    required
                  />

                </div>

                <div className="checkout-field">

                  <label htmlFor="checkout-city">
                    City / Municipality
                  </label>

                  <input
                    id="checkout-city"
                    type="text"
                    value={city}
                    onChange={(event) =>
                      setCity(event.target.value)
                    }
                    placeholder="City / Municipality"
                    required
                  />

                </div>

              </div>

              <div className="checkout-form-grid">

                <div className="checkout-field">

                  <label htmlFor="checkout-postal">
                    Postal code
                  </label>

                  <input
                    id="checkout-postal"
                    type="text"
                    value={postalCode}
                    onChange={(event) =>
                      setPostalCode(event.target.value)
                    }
                    placeholder="Postal code"
                  />

                </div>

                <div className="checkout-field">

                  <label htmlFor="checkout-landmark">
                    Landmark
                  </label>

                  <input
                    id="checkout-landmark"
                    type="text"
                    value={landmark}
                    onChange={(event) =>
                      setLandmark(event.target.value)
                    }
                    placeholder="Nearby landmark (optional)"
                  />

                </div>

              </div>

            </section>


            {/* SCHEDULE */}

            <section className="checkout-card">

              <p className="eyebrow">
                03 — SCHEDULE
              </p>

              <h2>
                Preferred delivery schedule
              </h2>

              <p className="checkout-schedule-note">
                Tell us when you'd prefer your flowers to arrive — BloomBox will
                confirm the schedule before delivery.
              </p>

              <div className="checkout-form-grid">

                <div className="checkout-field">

                  <label htmlFor="delivery-date">
                    Preferred date
                  </label>

                  <input
                    id="delivery-date"
                    type="date"
                    value={deliveryDate}
                    min={todayLocal()}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value && value < todayLocal()) return setDeliveryDate("");
                      setDeliveryDate(value);
                      if (value === todayLocal() && deliveryTime && deliveryTime <= nowLocal()) setDeliveryTime("");
                    }}
                    required
                  />

                </div>

                <div className="checkout-field">

                  <label htmlFor="delivery-time">
                    Preferred time
                  </label>

                  <input
                    id="delivery-time"
                    type="time"
                    value={deliveryTime}
                    min={deliveryDate === todayLocal() ? nowLocal() : undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (deliveryDate === todayLocal() && value && value <= nowLocal()) return setDeliveryTime("");
                      setDeliveryTime(value);
                    }}
                    required
                  />

                </div>

              </div>

            </section>


            {/* PAYMENT */}

            <section className="checkout-card">

              <p className="eyebrow">
                04 — PAYMENT
              </p>

              <h2>
                Payment method
              </h2>

              <div className="checkout-payment-options">

                <label className="checkout-payment-option">

                  <input
                    type="radio"
                    name="payment"
                    value="gcash"
                    checked={paymentMethod === "gcash"}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                  />

                  <span>
                    GCash
                  </span>

                </label>


                <label className="checkout-payment-option">

                  <input
                    type="radio"
                    name="payment"
                    value="maya"
                    checked={paymentMethod === "maya"}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                  />

                  <span>
                    Maya
                  </span>

                </label>


                <label className="checkout-payment-option">

                  <input
                    type="radio"
                    name="payment"
                    value="credit_card"
                    checked={paymentMethod === "credit_card"}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                  />

                  <span>
                    Credit / Debit Card
                  </span>

                </label>


                <label className="checkout-payment-option">

                  <input
                    type="radio"
                    name="payment"
                    value="cod"
                    checked={paymentMethod === "cod"}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                  />

                  <span>
                    Cash on Delivery
                  </span>

                </label>

              </div>

            </section>

          </div>


          {/* ORDER SUMMARY */}

          <aside className="checkout-summary">

            <p className="eyebrow">
              YOUR ORDER
            </p>

            <h2>
              Order summary
            </h2>

            <div className="checkout-summary-items">

              {items.map((item) => (

                <div
                  className="checkout-summary-item"
                  key={item.cart_item_id}
                >

                  <div>

                    <strong>
                      {item.product_name}
                    </strong>

                    <span>
                      {item.size || "One size"} × {item.quantity}
                      {item.gift_message ? " · gift note" : ""}
                    </span>

                  </div>

                  <strong>
                    ₱{formatPrice(item.subtotal)}
                  </strong>

                </div>

              ))}

            </div>

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-row">

              <span>
                Subtotal
              </span>

              <span>
                ₱{formatPrice(cart.subtotal)}
              </span>

            </div>

            <div className="checkout-summary-row">

              <span>
                Delivery
              </span>

              <span>
                Calculated later
              </span>

            </div>

            <div className="checkout-summary-divider" />

            <div className="checkout-summary-total">

              <span>
                Total
              </span>

              <strong>
                ₱{formatPrice(cart.total)}
              </strong>

            </div>

            <button
              type="submit"
              className="btn btn-dark checkout-continue-button"
              disabled={items.length === 0}
            >
              {items.length === 0 ? "Your bag is empty" : "Continue"}
            </button>

          </aside>

        </div>

      </form>

    </div>
  );
}

export default Checkout;
