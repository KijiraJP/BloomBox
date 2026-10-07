require("dotenv").config();

const bcrypt = require("bcrypt");
const db = require("../config/db");

// Local-development accounts only. Change this password before any deployment.
const DEMO_PASSWORD = "BloomBoxDemo2026!";

const staffAccounts = [
  {
    email: "admin.demo@bloombox.local",
    firstName: "Avery",
    lastName: "Admin",
    role: "admin"
  },
  {
    email: "rider.demo@bloombox.local",
    firstName: "Riley",
    lastName: "Rider",
    role: "rider",
    contactNumber: "09170000000"
  },
  {
    email: "rider.two.demo@bloombox.local",
    firstName: "Jordan",
    lastName: "Rider",
    role: "rider",
    contactNumber: "09170000001"
  }
];

async function findOrCreateStaff(account, passwordHash) {
  const [users] = await db.promise().query(
    "SELECT user_id, role FROM users WHERE email = ? LIMIT 1",
    [account.email]
  );

  let userId;

  if (users.length > 0) {
    if (users[0].role !== account.role) {
      throw new Error(
        `${account.email} already exists with role ${users[0].role}.`
      );
    }

    userId = users[0].user_id;
    console.log(`${account.role} already exists: ${account.email}`);
  } else {
    const [result] = await db.promise().query(
      `INSERT INTO users
       (email, password_hash, first_name, middle_name, last_name, role, account_status)
       VALUES (?, ?, ?, NULL, ?, ?, 'active')`,
      [
        account.email,
        passwordHash,
        account.firstName,
        account.lastName,
        account.role
      ]
    );

    userId = result.insertId;
    console.log(`Created ${account.role}: ${account.email}`);
  }

  if (account.role === "rider") {
    const [riders] = await db.promise().query(
      "SELECT rider_id FROM riders WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (riders.length === 0) {
      await db.promise().query(
        `INSERT INTO riders (user_id, contact_number, rider_status)
         VALUES (?, ?, 'active')`,
        [userId, account.contactNumber]
      );
      console.log(`Created rider profile for: ${account.email}`);
    }
  }
}

async function seedDemoStaff() {
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    for (const account of staffAccounts) {
      await findOrCreateStaff(account, passwordHash);
    }

    console.log("Demo staff setup complete.");
  } catch (error) {
    console.error("Demo staff setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
}

seedDemoStaff();
