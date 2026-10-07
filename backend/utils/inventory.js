const db = require("../config/db");

const deductStock = (productId, quantity) => {
  return new Promise((resolve, reject) => {
    if (!productId || !quantity || quantity <= 0) {
      return reject(new Error("Invalid product ID or quantity."));
    }

    db.beginTransaction((transactionError) => {
      if (transactionError) {
        return reject(transactionError);
      }

      const selectSql = `
        SELECT
          stock_id,
          product_id,
          stock_quantity
        FROM product_stock
        WHERE product_id = ?
        FOR UPDATE
      `;

      db.query(
        selectSql,
        [productId],
        (selectError, stockResults) => {
          if (selectError) {
            return db.rollback(() => {
              reject(selectError);
            });
          }

          if (stockResults.length === 0) {
            return db.rollback(() => {
              reject(
                new Error(
                  `No inventory record found for product ${productId}.`
                )
              );
            });
          }

          const stock = stockResults[0];
          const currentStock = Number(stock.stock_quantity);
          const requestedQuantity = Number(quantity);

          if (currentStock < requestedQuantity) {
            return db.rollback(() => {
              reject(
                new Error(
                  `Insufficient stock. Available: ${currentStock}. Requested: ${requestedQuantity}.`
                )
              );
            });
          }

          const newStock = currentStock - requestedQuantity;

          const updateSql = `
            UPDATE product_stock
            SET stock_quantity = ?
            WHERE stock_id = ?
          `;

          db.query(
            updateSql,
            [newStock, stock.stock_id],
            (updateError, updateResult) => {
              if (updateError) {
                return db.rollback(() => {
                  reject(updateError);
                });
              }

              if (updateResult.affectedRows === 0) {
                return db.rollback(() => {
                  reject(
                    new Error("Stock could not be updated.")
                  );
                });
              }

              db.commit((commitError) => {
                if (commitError) {
                  return db.rollback(() => {
                    reject(commitError);
                  });
                }

                resolve({
                  product_id: Number(productId),
                  quantity_deducted: requestedQuantity,
                  previous_stock: currentStock,
                  remaining_stock: newStock
                });
              });
            }
          );
        }
      );
    });
  });
};

module.exports = {
  deductStock
};