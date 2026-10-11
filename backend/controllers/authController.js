const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const db = require("../config/db");
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

const registerCustomer = async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      middle_name,
      last_name
    } = req.body;

    // Check required fields
    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({
        message: "Email, password, first name, and last name are required."
      });
    }

    // Check if email already exists
    const [existingUsers] = await db.promise().query(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Email is already registered."
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create customer account
    const [result] = await db.promise().query(
      `INSERT INTO users
      (email, password_hash, first_name, middle_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, 'customer')`,
      [
        email,
        passwordHash,
        first_name,
        middle_name || null,
        last_name
      ]
    );

    res.status(201).json({
      message: "Customer account created successfully.",
      user_id: result.insertId
    });

  } catch (error) {
    console.error("Registration error:", error);

    res.status(500).json({
      message: "Server error during registration."
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const [users] = await db.promise().query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const user = users[0];

    if (!user.password_hash) {
      return res.status(401).json({
        message: "This account does not use password login."
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (user.account_status !== "active") {
    return res.status(403).json({
        message: `Account is ${user.account_status}. Please contact the administrator.`
    });
    }

        const token = jwt.sign(
    {
        user_id: user.user_id,
        role: user.role
    },
    process.env.JWT_SECRET,
    {
        expiresIn: "1h"
    }
    );

    res.status(200).json({
    message: "Login successful.",
    token,
    user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        role: user.role,
        profile_picture: user.profile_picture
    }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Server error during login."
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required."
      });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const {
      sub: googleId,
      email,
      given_name,
      family_name,
      picture,
      email_verified
    } = payload;

    const googleName = payload.name || "";

    let firstName = given_name || "";
    let lastName = family_name || "";

    if (!lastName && googleName) {
      const nameParts = googleName.trim().split(/\s+/);

      if (nameParts.length > 1) {
        lastName = nameParts.pop();
        firstName = nameParts.join(" ");
      } else {
        firstName = nameParts[0];
      }
    }

    if (!firstName) {
      firstName = "Google";
    }

    if (!lastName) {
      lastName = "User";
    }

    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Google account email could not be verified."
      });
    }

    // Check whether this Google account already exists
    const [existingUsers] = await db.promise().query(
      `SELECT
        user_id,
        email,
        first_name,
        middle_name,
        last_name,
        role,
        google_id,
        profile_picture,
        account_status
       FROM users
       WHERE google_id = ? OR email = ?
       LIMIT 1`,
      [googleId, email]
    );

    let user;

    if (existingUsers.length > 0) {
      user = existingUsers[0];

      // Make sure the account is active
      if (user.account_status !== "active") {
        return res.status(403).json({
          message: `Account is ${user.account_status}. Please contact the administrator.`
        });
      }

      // Link Google ID if this existing account does not have one yet
      if (!user.google_id) {
        await db.promise().query(
          `UPDATE users
           SET google_id = ?, profile_picture = ?
           WHERE user_id = ?`,
          [
            googleId,
            picture || null,
            user.user_id
          ]
        );

        user.google_id = googleId;
        user.profile_picture = picture || null;
      }

    } else {
      // First-time Google login creates a CUSTOMER account
      const [result] = await db.promise().query(
        `INSERT INTO users
        (
          email,
          password_hash,
          first_name,
          middle_name,
          last_name,
          role,
          google_id,
          profile_picture
        )
        VALUES (?, NULL, ?, NULL, ?, 'customer', ?, ?)`,
        [
          email,
          firstName,
          lastName,
          googleId,
          picture || null
        ]
      );

      user = {
        user_id: result.insertId,
        email,
        first_name: firstName,
        middle_name: null,
        last_name: lastName,
        role: "customer",
        google_id: googleId,
        profile_picture: picture || null,
        account_status: "active"
      };
    }

    // Create BloomBox JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    return res.status(200).json({
      message: "Google login successful.",
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        role: user.role,
        profile_picture: user.profile_picture,
        account_status: user.account_status
      }
    });

  } catch (error) {
    console.error("Google login error:", error);

    return res.status(500).json({
      message: "Server error during Google login."
    });
  }
};

const googleRiderLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required."
      });
    }

    // Verify the Google credential
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const {
      sub: googleId,
      email,
      email_verified,
      given_name,
      family_name,
      picture
    } = payload;

    // Make sure Google verified the email
    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Google account email could not be verified."
      });
    }

    // Find an existing rider through the users table
    const [users] = await db.promise().query(
      `SELECT
        u.user_id,
        u.email,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.role,
        u.google_id,
        u.profile_picture,
        u.account_status,
        r.rider_id,
        r.rider_status
       FROM users u
       INNER JOIN riders r
         ON u.user_id = r.user_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    );

    // Google account does not belong to an existing rider
    if (users.length === 0) {
      return res.status(403).json({
        message: "This Google account is not registered as a rider."
      });
    }

    const user = users[0];

    // Double-check the role
    if (user.role !== "rider") {
      return res.status(403).json({
        message: "This account is not registered as a rider."
      });
    }

    // Check the rider's account status
    if (user.account_status !== "active") {
      return res.status(403).json({
        message: `Account is ${user.account_status}. Please contact the administrator.`
      });
    }

    // Check the rider's rider status
    if (user.rider_status !== "active") {
      return res.status(403).json({
        message: `Rider account is ${user.rider_status}. Please contact the administrator.`
      });
    }

    // Link Google account to the existing rider account
    if (!user.google_id) {
      await db.promise().query(
        `UPDATE users
         SET google_id = ?, profile_picture = ?
         WHERE user_id = ?`,
        [
          googleId,
          picture || null,
          user.user_id
        ]
      );

      user.google_id = googleId;
      user.profile_picture = picture || null;
    }

    // Create BloomBox JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h"
      }
    );

    return res.status(200).json({
      message: "Rider Google login successful.",
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        role: user.role,
        profile_picture: user.profile_picture,
        account_status: user.account_status,
        rider_id: user.rider_id,
        rider_status: user.rider_status
      }
    });

  } catch (error) {
    console.error("Rider Google login error:", error);

    return res.status(500).json({
      message: "Server error during rider Google login."
    });
  }
};

const getMe = async (req, res) => {
  try {
    const [users] = await db.promise().query(
      `SELECT 
        user_id,
        email,
        first_name,
        middle_name,
        last_name,
        role,
        profile_picture,
        account_status
       FROM users
       WHERE user_id = ?`,
      [req.user.user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    res.status(200).json({
      user: users[0]
    });

  } catch (error) {
    console.error("Get user error:", error);

    res.status(500).json({
      message: "Server error."
    });
  }
};

const getAdminTest = async (req, res) => {
  res.status(200).json({
    message: "Admin access granted.",
    user: req.user
  });
};

module.exports = {
  registerCustomer,
  login,
  googleLogin,
  googleRiderLogin,
  getMe,
  getAdminTest
};