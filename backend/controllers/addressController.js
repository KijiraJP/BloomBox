const db = require("../config/db");

const createAddress = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      street,
      barangay,
      city,
      postalCode,
      landmark
    } = req.body;

    // Validate required fields
    if (!street || !barangay || !city) {
      return res.status(400).json({
        message: "Street, barangay, and city are required."
      });
    }

    const [result] = await db.promise().query(
      `INSERT INTO addresses
      (
        user_id,
        street,
        barangay,
        city,
        postal_code,
        landmark
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        street.trim(),
        barangay.trim(),
        city.trim(),
        postalCode ? postalCode.trim() : null,
        landmark ? landmark.trim() : null
      ]
    );

    const [rows] = await db.promise().query(
      `SELECT
        address_id,
        user_id,
        street,
        barangay,
        city,
        postal_code,
        landmark,
        created_at
       FROM addresses
       WHERE address_id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      message: "Address saved successfully.",
      address: rows[0]
    });

  } catch (error) {
    console.error("Create address error:", error);

    return res.status(500).json({
      message: "Server error while saving address."
    });
  }
};

module.exports = {
  createAddress
};