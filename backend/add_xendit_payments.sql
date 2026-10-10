-- Run this once against the `bloombox` database (e.g. in HeidiSQL or the
-- mysql CLI) to add Xendit gateway columns to existing payment rows.
-- This does not change any existing payment data (all new columns are NULL).
ALTER TABLE payments
  ADD COLUMN gateway              VARCHAR(50)  NULL AFTER payment_date,
  ADD COLUMN gateway_invoice_id   VARCHAR(100) NULL AFTER gateway,
  ADD COLUMN gateway_checkout_url VARCHAR(500) NULL AFTER gateway_invoice_id,
  ADD COLUMN gateway_status       VARCHAR(50)  NULL AFTER gateway_checkout_url;
