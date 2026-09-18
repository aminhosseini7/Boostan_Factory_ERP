const postgres = require('postgres');
const { getEnv } = require('./env');

const env = getEnv();

const sql = postgres(env.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: false,
  prepare: false
});

module.exports = sql;
