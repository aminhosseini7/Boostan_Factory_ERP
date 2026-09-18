async function logActivity(sql, { userId, action, entityType = null, entityId = null, details = {} }) {
  await sql`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (${userId || null}, ${action}, ${entityType}, ${entityId}, ${sql.json(details)})
  `;
}

module.exports = { logActivity };
