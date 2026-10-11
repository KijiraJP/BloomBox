-- Run this once in HeidiSQL while the `bloombox` database is selected.
-- It links new order items to their original cart items, without changing
-- existing historical order records.
ALTER TABLE order_items
  ADD COLUMN cart_item_id INT NULL AFTER order_item_id,
  ADD INDEX idx_order_items_cart_item_id (cart_item_id),
  ADD CONSTRAINT fk_order_item_cart_item
    FOREIGN KEY (cart_item_id)
    REFERENCES cart_items(cart_item_id)
    ON DELETE SET NULL;
