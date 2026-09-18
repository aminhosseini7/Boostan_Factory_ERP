// Dynamic pricing persistence

class PriceHistoryRepository {
  constructor(db) {
    this.db = db;
  }

  async create(productId, price, validFrom, userId) {
    const result = await this.db.query(
      `INSERT INTO product_prices
       (product_id, price, valid_from, created_by)
       VALUES($1,$2,$3,$4)
       RETURNING *`,
      [productId, price, validFrom, userId]
    );

    return result.rows[0];
  }

  async getPriceAt(productId, date) {
    const result = await this.db.query(
      `SELECT price FROM product_prices
       WHERE product_id=$1
       AND valid_from <= $2
       ORDER BY valid_from DESC
       LIMIT 1`,
      [productId, date]
    );

    return result.rows[0]?.price || null;
  }
}

module.exports = PriceHistoryRepository;
