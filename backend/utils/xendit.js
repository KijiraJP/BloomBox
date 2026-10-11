const https = require("https");

// Thin wrapper around the Xendit REST API using the built-in https module
// (no extra dependency). Auth is HTTP Basic with the secret key as the
// username and an empty password.
const XENDIT_HOST = "api.xendit.co";

function request(method, path, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.XENDIT_SECRET_KEY;

    if (!secretKey) {
      const error = new Error("Xendit secret key is not configured.");
      error.statusCode = 500;
      return reject(error);
    }

    const payload = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${secretKey}:`).toString("base64");

    const options = {
      hostname: XENDIT_HOST,
      path: path,
      method: method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...(extraHeaders || {})
      }
    };

    if (payload) {
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        let parsed = null;

        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (parseError) {
          parsed = { raw: data };
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          return resolve(parsed);
        }

        const error = new Error(
          (parsed && (parsed.message || parsed.error_code)) ||
            "Xendit request failed."
        );
        error.statusCode = res.statusCode;
        error.details = parsed;
        reject(error);
      });
    });

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

// Create a hosted invoice. The customer pays on the returned invoice_url.
function createInvoice({ externalId, amount, payerEmail, description }) {
  const payload = {
    external_id: externalId,
    amount: Number(amount),
    payer_email: payerEmail,
    description: description
  };

  const successUrl = process.env.XENDIT_SUCCESS_REDIRECT_URL;
  const failureUrl = process.env.XENDIT_FAILURE_REDIRECT_URL;

  if (successUrl) {
    payload.success_redirect_url = successUrl;
  }

  if (failureUrl) {
    payload.failure_redirect_url = failureUrl;
  }

  return request("POST", "/v2/invoices", payload);
}

// Fetch a single invoice so the status can be verified server-side.
function getInvoice(invoiceId) {
  return request("GET", `/v2/invoices/${invoiceId}`);
}

// Create a dynamic QR Ph payment request (GCash, Maya and bank apps).
// The QR payload is returned inside the actions[] array of the response.
function createQrPaymentRequest({ referenceId, amount }) {
  return request(
    "POST",
    "/v3/payment_requests",
    {
      reference_id: referenceId,
      type: "PAY",
      country: "PH",
      currency: "PHP",
      request_amount: Number(amount),
      channel_code: "QRPH"
    },
    { "api-version": "2024-11-11" }
  );
}

// Fetch a QR Ph payment request to check whether the customer has paid.
function getPaymentRequest(paymentRequestId) {
  return request(
    "GET",
    `/v3/payment_requests/${paymentRequestId}`,
    null,
    { "api-version": "2024-11-11" }
  );
}

module.exports = {
  createInvoice,
  getInvoice,
  createQrPaymentRequest,
  getPaymentRequest
};
