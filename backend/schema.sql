-- =============================================================================
-- BloomBox - MySQL schema
-- =============================================================================
-- Derived from every SQL statement in the backend source
-- (routes/, controllers/, utils/, scripts/, config/db.js) and cross-checked
-- against the raw table artifacts (*.frm) shipped at the repository root.
--
-- Load with:
--   mysql -u root -p < backend/schema.sql
-- (or paste into HeidiSQL / MySQL Workbench and execute as a script)
--
-- This file is intended for a FRESH database: it creates the database, all
-- tables, the order_items.cart_item_id migration, and a small seed section.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS bloombox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bloombox;

-- -----------------------------------------------------------------------------
-- users
-- Referenced by: authController (register/login/google/getMe), seedDemoStaff,
-- deliveryRoutes (rider lists), every JOIN users u ON u.user_id = r.user_id.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  user_id         INT          NOT NULL AUTO_INCREMENT,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NULL,                 -- NULL for Google-only accounts
  first_name      VARCHAR(100) NOT NULL,
  middle_name     VARCHAR(100) NULL,
  last_name       VARCHAR(100) NOT NULL,
  role            ENUM('customer','rider','admin')   NOT NULL DEFAULT 'customer',
  google_id       VARCHAR(255) NULL,                 -- Google "sub" subject id
  profile_picture VARCHAR(500) NULL,
  account_status  ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google_id (google_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- riders  (1:1 profile row for users with role = 'rider')
-- Referenced by: seedDemoStaff, authController.googleRiderLogin,
-- deliveryRoutes (rider lookup / assignments).
-- -----------------------------------------------------------------------------
CREATE TABLE riders (
  rider_id       INT         NOT NULL AUTO_INCREMENT,
  user_id        INT         NOT NULL,
  contact_number VARCHAR(20) NULL,
  rider_status   ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rider_id),
  UNIQUE KEY uq_riders_user_id (user_id),
  CONSTRAINT fk_riders_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- addresses
-- Referenced by: addressController (INSERT + SELECT), orderRoutes,
-- orderController, deliveryRoutes (JOIN addresses a ON a.address_id = o.address_id).
-- -----------------------------------------------------------------------------
CREATE TABLE addresses (
  address_id  INT          NOT NULL AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  street      VARCHAR(255) NOT NULL,
  barangay    VARCHAR(100) NOT NULL,
  city        VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20)  NULL,
  landmark    VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (address_id),
  KEY idx_addresses_user_id (user_id),
  CONSTRAINT fk_address_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- carts  (one cart per customer - all lookups are WHERE user_id = ? LIMIT 1)
-- Referenced by: cartRoutes, orderRoutes, orderController.
-- -----------------------------------------------------------------------------
CREATE TABLE carts (
  cart_id    INT       NOT NULL AUTO_INCREMENT,
  user_id    INT       NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_id),
  UNIQUE KEY uq_carts_user_id (user_id),
  CONSTRAINT fk_carts_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- products
-- Referenced by: productRoutes (SELECT/INSERT/DELETE), cartRoutes,
-- orderRoutes, orderController, stockRoutes, paymentRoutes, deliveryRoutes.
-- -----------------------------------------------------------------------------
CREATE TABLE products (
  product_id    INT           NOT NULL AUTO_INCREMENT,
  product_name  VARCHAR(255)  NOT NULL,
  product_image VARCHAR(500)  NULL,
  description   TEXT          NULL,
  price         DECIMAL(10,2) NOT NULL,
  category      VARCHAR(100)  NOT NULL,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- product_stock  (exactly one stock row per product; code always takes rows[0]
-- of `WHERE product_id = ?` and LEFT JOINs it onto products).
-- Referenced by: stockRoutes, utils/inventory.js, paymentRoutes,
-- orderRoutes, deliveryRoutes (ps.stock_id / ps.stock_quantity).
-- -----------------------------------------------------------------------------
CREATE TABLE product_stock (
  stock_id       INT NOT NULL AUTO_INCREMENT,
  product_id     INT NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (stock_id),
  UNIQUE KEY uq_product_stock_product (product_id),
  CONSTRAINT fk_product_stock_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- cart_items
-- Referenced by: cartRoutes (SELECT/INSERT/UPDATE/DELETE), orderRoutes,
-- orderController, paymentRoutes (clearPaidCartItems), add_order_item_cart_link.
-- -----------------------------------------------------------------------------
CREATE TABLE cart_items (
  cart_item_id INT           NOT NULL AUTO_INCREMENT,
  cart_id      INT           NOT NULL,
  product_id   INT           NOT NULL,
  quantity     INT           NOT NULL DEFAULT 1,
  unit_price   DECIMAL(10,2) NOT NULL,
  size         VARCHAR(50)   NULL,           -- 'Small' | 'Medium' | 'Large' (frontend pills)
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cart_item_id),
  KEY idx_cart_items_cart_id (cart_id),
  KEY idx_cart_items_product_id (product_id),
  CONSTRAINT fk_cart_item_cart
    FOREIGN KEY (cart_id) REFERENCES carts (cart_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cart_item_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- orders
-- Referenced by: orderRoutes (history + checkout), orderController,
-- paymentRoutes, deliveryRoutes.
-- NOTE: order_items.cart_item_id is added by the guarded migration below.
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  order_id     INT           NOT NULL AUTO_INCREMENT,
  user_id      INT           NOT NULL,
  address_id   INT           NOT NULL,
  order_status ENUM('pending','confirmed','preparing','out_for_delivery',
                    'delivered','cancelled') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY idx_orders_user_id (user_id),
  KEY idx_orders_address_id (address_id),
  CONSTRAINT fk_order_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_order_address
    FOREIGN KEY (address_id) REFERENCES addresses (address_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- order_items
-- product_name / unit_price / subtotal are denormalised snapshots of the
-- product at checkout time, so product_id may become NULL if the product row
-- is ever deleted (history stays readable through product_name).
-- cart_item_id is added afterwards by add_order_item_cart_link.sql (kept at the
-- end of this file, guarded) so this CREATE matches the original table layout.
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
  order_item_id INT           NOT NULL AUTO_INCREMENT,
  order_id      INT           NOT NULL,
  product_id    INT           NULL,
  product_name  VARCHAR(255)  NOT NULL,
  quantity      INT           NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  size          VARCHAR(50)   NULL,
  subtotal      DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_item_id),
  KEY idx_order_items_order_id (order_id),
  KEY idx_order_items_product_id (product_id),
  CONSTRAINT fk_order_item_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_item_product
    FOREIGN KEY (product_id) REFERENCES products (product_id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- payments  (one row per payment attempt; attempt_number = MAX(attempt)+1)
-- Referenced by: paymentRoutes, deliveryRoutes (COD collection), orderRoutes.
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  payment_id            INT           NOT NULL AUTO_INCREMENT,
  order_id              INT           NOT NULL,
  attempt_number        INT           NOT NULL DEFAULT 1,
  payment_method        ENUM('gcash','maya','credit_card','debit_card','bank','cod')
                                      NOT NULL,
  amount                DECIMAL(10,2) NOT NULL,
  payment_status        ENUM('pending','successful','failed','cancelled')
                                      NOT NULL DEFAULT 'pending',
  transaction_reference VARCHAR(255)  NULL,
  payment_date          DATETIME      NULL,   -- set to CURRENT_TIMESTAMP on success
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  KEY idx_payments_order_status (order_id, payment_status),
  CONSTRAINT fk_payment_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- deliveries  (schedule row created at checkout; one per order)
-- Referenced by: deliveryRoutes, orderRoutes (LEFT JOIN deliveries d).
-- -----------------------------------------------------------------------------
CREATE TABLE deliveries (
  delivery_id     INT         NOT NULL AUTO_INCREMENT,
  order_id        INT         NOT NULL,
  delivery_date   DATE        NOT NULL,      -- frontend <input type="date">
  delivery_time   TIME        NOT NULL,      -- frontend <input type="time">
  delivery_status ENUM('pending','confirmed','assigned','accepted','out_for_delivery',
                       'delivered','failed','cancelled') NOT NULL DEFAULT 'pending',
  rejection_reason TEXT       NULL,          -- admin reason when a request is declined
  confirmed_at    DATETIME    NULL,          -- when the admin confirmed the schedule
  street          VARCHAR(255) NOT NULL,
  barangay        VARCHAR(100) NOT NULL,
  city            VARCHAR(100) NOT NULL,
  postal_code     VARCHAR(20)  NULL,
  landmark        VARCHAR(255) NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_id),
  UNIQUE KEY uq_deliveries_order_id (order_id),
  KEY idx_deliveries_schedule (delivery_date, delivery_time),
  CONSTRAINT fk_delivery_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- delivery_assignments  (rider <-> delivery, created by the admin)
-- Referenced by: deliveryRoutes (assign / respond / complete / collect-cod).
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_assignments (
  assignment_id     INT         NOT NULL AUTO_INCREMENT,
  delivery_id       INT         NOT NULL,
  rider_id          INT         NOT NULL,
  assignment_status ENUM('assigned','accepted','rejected','completed','cancelled')
                                    NOT NULL DEFAULT 'assigned',
  rejection_reason  TEXT        NULL,
  assigned_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at      DATETIME    NULL,
  PRIMARY KEY (assignment_id),
  KEY idx_delivery_assignments_delivery_id (delivery_id),
  KEY idx_delivery_assignments_rider_id (rider_id),
  KEY idx_delivery_assignments_status (assignment_status),
  CONSTRAINT fk_assignment_delivery
    FOREIGN KEY (delivery_id) REFERENCES deliveries (delivery_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assignment_rider
    FOREIGN KEY (rider_id) REFERENCES riders (rider_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- notifications
-- NOT referenced by any backend query; the table exists in the original data
-- directory artifacts (notifications.frm) so it is recreated here for parity.
-- Column names come from the .frm; their types are a GUESS (see reply notes).
-- -----------------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id   INT          NOT NULL AUTO_INCREMENT,
  user_id           INT          NOT NULL,
  order_id          INT          NULL,
  delivery_id       INT          NULL,
  notification_type VARCHAR(50)  NULL,
  title             VARCHAR(255) NULL,
  message           TEXT         NULL,
  is_read           TINYINT(1)   NOT NULL DEFAULT 0,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id),
  KEY idx_notifications_user_id (user_id),
  KEY idx_notifications_order_id (order_id),
  KEY idx_notifications_delivery_id (delivery_id),
  CONSTRAINT fk_notification_user
    FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_delivery
    FOREIGN KEY (delivery_id) REFERENCES deliveries (delivery_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- MIGRATION: backend/add_order_item_cart_link.sql
-- Run once; guarded so re-running the schema file is safe.
-- =============================================================================
SET @cart_item_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'order_items'
    AND COLUMN_NAME  = 'cart_item_id'
);

SET @ddl := IF(
  @cart_item_col_exists = 0,
  'ALTER TABLE order_items
     ADD COLUMN cart_item_id INT NULL AFTER order_item_id,
     ADD INDEX idx_order_items_cart_item_id (cart_item_id),
     ADD CONSTRAINT fk_order_item_cart_item
       FOREIGN KEY (cart_item_id)
       REFERENCES cart_items(cart_item_id)
       ON DELETE SET NULL',
  'SELECT ''order_items.cart_item_id already exists - migration skipped.'' AS notice'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- MIGRATION: gift options on cart_items / order_items (wrap_style + gift_message)
-- Guarded so re-running the schema file is safe.
-- =============================================================================
SET @cart_items_gift_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'cart_items'
    AND COLUMN_NAME  = 'wrap_style'
);

SET @ddl := IF(
  @cart_items_gift_exists = 0,
  'ALTER TABLE cart_items
     ADD COLUMN wrap_style VARCHAR(50) NULL AFTER size,
     ADD COLUMN gift_message VARCHAR(255) NULL AFTER wrap_style',
  'SELECT ''cart_items gift options already exist - migration skipped.'' AS notice'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_items_gift_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'order_items'
    AND COLUMN_NAME  = 'wrap_style'
);

SET @ddl := IF(
  @order_items_gift_exists = 0,
  'ALTER TABLE order_items
     ADD COLUMN wrap_style VARCHAR(50) NULL AFTER size,
     ADD COLUMN gift_message VARCHAR(255) NULL AFTER wrap_style',
  'SELECT ''order_items gift options already exist - migration skipped.'' AS notice'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- Demo staff credentials match backend/scripts/seedDemoStaff.js exactly
-- (npm run seed:demo-staff), so running that script afterwards is a no-op for
-- these two accounts (it detects the existing rows and skips them).
--
--   Password for BOTH accounts : BloomBoxDemo2026!
--   password_hash below        : bcrypt.hash('BloomBoxDemo2026!', 10)
--                                ($2b$10$cuJbl.m5BIwg4AG35N65wux/qwy4rR0zJ2TlYE3jf0dYFJMzMUIv2)
-- =============================================================================

INSERT INTO users
  (email, password_hash, first_name, middle_name, last_name, role, account_status)
VALUES
  ('admin.demo@bloombox.local',
   '$2b$10$cuJbl.m5BIwg4AG35N65wux/qwy4rR0zJ2TlYE3jf0dYFJMzMUIv2',
   'Avery', NULL, 'Admin', 'admin', 'active');

INSERT INTO users
  (email, password_hash, first_name, middle_name, last_name, role, account_status)
VALUES
  ('rider.demo@bloombox.local',
   '$2b$10$cuJbl.m5BIwg4AG35N65wux/qwy4rR0zJ2TlYE3jf0dYFJMzMUIv2',
   'Riley', NULL, 'Rider', 'rider', 'active');

-- Rider profile row required by deliveryRoutes / googleRiderLogin
INSERT INTO riders (user_id, contact_number, rider_status)
SELECT user_id, '09170000000', 'active'
FROM users
WHERE email = 'rider.demo@bloombox.local';

-- ---------------------------------------------------------------------------
-- Products + stock (status defaults to 'active', shown by productRoutes)
-- ---------------------------------------------------------------------------
INSERT INTO products
  (product_id, product_name, product_image, description, price, category, status)
VALUES
  (1, 'Sunrise Tulip Bouquet',
   'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=800&q=80',
   'A cheerful bunch of fresh yellow and peach tulips wrapped in kraft paper.',
   1299.00, 'Bouquets', 'active'),
  (2, 'Crimson Rose Bundle',
   'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=800&q=80',
   'Two dozen long-stem red roses, hand-tied with eucalyptus accents.',
   1499.00, 'Bouquets', 'active'),
  (3, 'Pastel Peony Jar',
   'https://images.unsplash.com/photo-1487070183336-b863922373d4?auto=format&fit=crop&w=800&q=80',
   'Soft pink peonies arranged in a reusable glass mason jar.',
   1099.00, 'Arrangements', 'active'),
  (4, 'White Lily Centerpiece',
   'https://images.unsplash.com/photo-1508610048659-a06b669e3321?auto=format&fit=crop&w=800&q=80',
   'Elegant white oriental lilies with baby''s breath in a low ceramic bowl.',
   1799.00, 'Arrangements', 'active'),
  (5, 'Golden Sunflower Bunch',
   'https://images.unsplash.com/photo-1470509037663-253afd7f0f51?auto=format&fit=crop&w=800&q=80',
   'Bright farm-fresh sunflowers that instantly lift any room.',
   899.00, 'Bouquets', 'active'),
  (6, 'Monstera Deliciosa Pot',
   'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80',
   'Lush indoor monstera in a matte white ceramic planter.',
   1599.00, 'Plants', 'active'),
  (7, 'Peace Lily Planter',
   'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=800&q=80',
   'Classic peace lily with glossy green leaves and white blooms.',
   1199.00, 'Plants', 'active'),
  (8, 'Succulent Trio Box',
   'https://images.unsplash.com/photo-1459156212016-c812468e2115?auto=format&fit=crop&w=800&q=80',
   'Three assorted succulents in stone pots, ready for gifting.',
   749.00, 'Plants', 'active');

INSERT INTO product_stock (product_id, stock_quantity) VALUES
  (1, 40),
  (2, 35),
  (3, 25),
  (4, 20),
  (5, 50),
  (6, 18),
  (7, 22),
  (8, 60);
