// Phase 4 - Database repository foundation
// Production implementation point for SQL queries.

class Repository {
  constructor(db) {
    this.db = db;
  }

  async findAll(table) {
    const result = await this.db.query(`SELECT * FROM ${table}`);
    return result.rows;
  }

  async findById(table, id) {
    const result = await this.db.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = Repository;
