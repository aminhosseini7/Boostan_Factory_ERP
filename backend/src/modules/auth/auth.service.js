const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sql = require('../../config/database');
const { getEnv } = require('../../config/env');
const httpError = require('../../utils/httpError');

async function login(username, password) {
  const users = await sql`
    SELECT id, username, full_name, password_hash, role, is_active
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  const user = users[0];
  if (!user || !user.is_active) throw httpError(401, 'Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw httpError(401, 'Invalid credentials');

  const token = jwt.sign(
    { id: user.id, username: user.username, fullName: user.full_name, role: user.role },
    getEnv().jwtSecret,
    { expiresIn: getEnv().jwtExpiresIn }
  );

  await sql`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (${user.id}, 'LOGIN', 'USER', ${user.id}, ${sql.json({ username: user.username })})
  `;

  return {
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role }
  };
}

async function me(userId) {
  const rows = await sql`
    SELECT id, username, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt"
    FROM users WHERE id = ${userId}
  `;
  if (!rows.length) throw httpError(404, 'User not found');
  return rows[0];
}

module.exports = { login, me };
