-- Visual arrangement properties for individual custom-bouquet flower instances.
-- These values affect only how a flower is displayed in the Bouquet Builder.
-- They do not change stock, price, quantity, cart, checkout, or order processing.

ALTER TABLE custom_bouquet_slots
  ADD COLUMN position_x DECIMAL(5,2) NULL DEFAULT NULL AFTER unit_price,
  ADD COLUMN position_y DECIMAL(5,2) NULL DEFAULT NULL AFTER position_x,
  ADD COLUMN visual_scale DECIMAL(4,2) NULL DEFAULT NULL AFTER position_y,
  ADD COLUMN layer_order SMALLINT NULL DEFAULT NULL AFTER visual_scale;
