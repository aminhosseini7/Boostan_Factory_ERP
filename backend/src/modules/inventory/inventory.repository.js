// Inventory ledger persistence

class InventoryRepository {
  constructor(db) {
    this.db = db;
  }

  async addTransaction(data) {
    const result = await this.db.query(
      `INSERT INTO inventory_transactions
       (product_id, transaction_type, quantity, reference_id)
       VALUES($1,$2,$3,$4)
       RETURNING *`,
      [
        data.productId,
        data.type,
        data.quantity,
        data.referenceId
      ]
    );

    return result.rows[0];
  }
}

module.exports = InventoryRepository;
