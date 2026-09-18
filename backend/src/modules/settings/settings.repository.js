// Phase 4 - Settings persistence layer

class SettingsRepository {
  constructor(db) {
    this.db = db;
  }

  async get(key) {
    const result = await this.db.query(
      'SELECT * FROM factory_settings WHERE key = $1',
      [key]
    );
    return result.rows[0] || null;
  }

  async set(key, value) {
    const result = await this.db.query(
      `INSERT INTO factory_settings(key,value)
       VALUES($1,$2)
       ON CONFLICT(key)
       DO UPDATE SET value=$2, updated_at=now()
       RETURNING *`,
      [key, value]
    );
    return result.rows[0];
  }
}

module.exports = SettingsRepository;
