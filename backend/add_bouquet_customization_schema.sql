-- BloomBox Bouquet Customization Module: schema foundation
-- Run this migration ONCE in the bloombox database after reviewing it.
-- It does not change existing ready-made product or order records.

CREATE TABLE bouquet_size_options (
  size_code VARCHAR(20) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  max_flower_slots INT NOT NULL,
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (size_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bouquet_options (
  option_id INT NOT NULL AUTO_INCREMENT,
  option_type ENUM('wrapping','ribbon','greeting_card') NOT NULL,
  option_name VARCHAR(100) NOT NULL,
  option_color VARCHAR(50) DEFAULT NULL,
  option_image VARCHAR(500) DEFAULT NULL,
  additional_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (option_id),
  KEY idx_bouquet_options_type_active (option_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE custom_bouquets (
  custom_bouquet_id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  bouquet_size_code VARCHAR(20) NOT NULL,
  theme_color VARCHAR(50) DEFAULT NULL,
  wrapping_option_id INT DEFAULT NULL,
  ribbon_option_id INT DEFAULT NULL,
  greeting_card_option_id INT DEFAULT NULL,
  personalized_message VARCHAR(250) DEFAULT NULL,
  flower_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bouquet_base_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  wrapping_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  add_on_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bouquet_status ENUM('draft','in_cart','ordered','cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (custom_bouquet_id),
  KEY idx_custom_bouquets_user_status (user_id, bouquet_status),
  KEY idx_custom_bouquets_size (bouquet_size_code),
  KEY idx_custom_bouquets_wrapping (wrapping_option_id),
  KEY idx_custom_bouquets_ribbon (ribbon_option_id),
  KEY idx_custom_bouquets_card (greeting_card_option_id),
  CONSTRAINT fk_custom_bouquet_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_custom_bouquet_size
    FOREIGN KEY (bouquet_size_code) REFERENCES bouquet_size_options (size_code) ON DELETE RESTRICT,
  CONSTRAINT fk_custom_bouquet_wrapping
    FOREIGN KEY (wrapping_option_id) REFERENCES bouquet_options (option_id) ON DELETE SET NULL,
  CONSTRAINT fk_custom_bouquet_ribbon
    FOREIGN KEY (ribbon_option_id) REFERENCES bouquet_options (option_id) ON DELETE SET NULL,
  CONSTRAINT fk_custom_bouquet_card
    FOREIGN KEY (greeting_card_option_id) REFERENCES bouquet_options (option_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE custom_bouquet_slots (
  custom_bouquet_slot_id INT NOT NULL AUTO_INCREMENT,
  custom_bouquet_id INT NOT NULL,
  slot_number INT NOT NULL,
  product_id INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (custom_bouquet_slot_id),
  UNIQUE KEY uq_custom_bouquet_slot (custom_bouquet_id, slot_number),
  KEY idx_custom_bouquet_slot_product (product_id),
  CONSTRAINT fk_custom_bouquet_slot_bouquet
    FOREIGN KEY (custom_bouquet_id) REFERENCES custom_bouquets (custom_bouquet_id) ON DELETE CASCADE,
  CONSTRAINT fk_custom_bouquet_slot_product
    FOREIGN KEY (product_id) REFERENCES products (product_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing cart and order rows remain ordinary product items.
ALTER TABLE cart_items
  MODIFY COLUMN product_id INT NULL,
  ADD COLUMN item_type ENUM('product','custom_bouquet') NOT NULL DEFAULT 'product' AFTER cart_id,
  ADD COLUMN custom_bouquet_id INT NULL AFTER product_id,
  ADD KEY idx_cart_item_custom_bouquet (custom_bouquet_id),
  ADD CONSTRAINT fk_cart_item_custom_bouquet
    FOREIGN KEY (custom_bouquet_id) REFERENCES custom_bouquets (custom_bouquet_id) ON DELETE SET NULL;

ALTER TABLE order_items
  MODIFY COLUMN product_id INT NULL,
  ADD COLUMN item_type ENUM('product','custom_bouquet') NOT NULL DEFAULT 'product' AFTER order_id,
  ADD COLUMN custom_bouquet_id INT NULL AFTER product_id,
  ADD KEY idx_order_item_custom_bouquet (custom_bouquet_id),
  ADD CONSTRAINT fk_order_item_custom_bouquet
    FOREIGN KEY (custom_bouquet_id) REFERENCES custom_bouquets (custom_bouquet_id) ON DELETE SET NULL;

-- Initial configuration values. Update prices later when business rules are approved.
INSERT INTO bouquet_size_options (size_code, display_name, max_flower_slots, base_price)
VALUES
  ('small', 'Small', 5, 0.00),
  ('medium', 'Medium', 10, 0.00),
  ('large', 'Large', 15, 0.00);

INSERT INTO bouquet_options (option_type, option_name, option_color, additional_price)
VALUES
  ('wrapping', 'Kraft Paper', 'Natural', 0.00),
  ('wrapping', 'Satin Wrap', 'White', 0.00),
  ('wrapping', 'Gift Box', 'Blush', 0.00),
  ('ribbon', 'Classic Ribbon', 'Pink', 0.00),
  ('ribbon', 'Classic Ribbon', 'Red', 0.00),
  ('greeting_card', 'Greeting Card', 'Classic', 0.00);
