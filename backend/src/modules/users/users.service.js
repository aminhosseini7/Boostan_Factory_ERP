const bcrypt = require('bcryptjs');
const sql = require('../../config/database');
const httpError = require('../../utils/httpError');
const { logActivity } = require('../../services/activity.service');

async function list() {
  return sql`
    SELECT id, username, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt"
    FROM users ORDER BY created_at DESC
  `;
}

async function create(data, actorId) {
  const exists = await sql`SELECT 1 FROM users WHERE username = ${data.username}`;
  if (exists.length) throw httpError(409, 'Username already exists');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const rows = await sql.begin(async (tx) => {
    const created = await tx`
      INSERT INTO users (username, full_name, password_hash, role)
      VALUES (${data.username}, ${data.fullName}, ${passwordHash}, ${data.role})
      RETURNING id, username, full_name AS "fullName", role, is_active AS "isActive", created_at AS "createdAt"
    `;
    await logActivity(tx, { userId: actorId, action: 'CREATE_USER', entityType: 'USER', entityId: created[0].id, details: { username: data.username, role: data.role } });
    return created[0];
  });
  return rows;
}

async function setActive(id, isActive, actorId) {
  if (String(id) === String(actorId) && !isActive) throw httpError(400, 'You cannot deactivate your own manager account');
  const rows = await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE users SET is_active = ${isActive}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, username, full_name AS "fullName", role, is_active AS "isActive"
    `;
    if (!updated.length) throw httpError(404, 'User not found');
    await logActivity(tx, { userId: actorId, action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', entityType: 'USER', entityId: id });
    return updated[0];
  });
  return rows;
}

module.exports = { list, create, setActive };
