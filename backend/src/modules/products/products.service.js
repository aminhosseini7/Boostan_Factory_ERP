const sql = require('../../config/database');
const httpError = require('../../utils/httpError');
const { logActivity } = require('../../services/activity.service');

async function list(search = '') {
  const pattern = `%${search}%`;
  return sql`
    SELECT id, code, name, unit, price::float8 AS price, minimum_stock::float8 AS "minimumStock",
           is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM products
    WHERE (${search} = '' OR name ILIKE ${pattern} OR COALESCE(code,'') ILIKE ${pattern})
    ORDER BY is_active DESC, name
  `;
}

async function get(id) {
  const rows = await sql`
    SELECT id, code, name, unit, price::float8 AS price, minimum_stock::float8 AS "minimumStock",
           is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM products WHERE id = ${id}
  `;
  if (!rows.length) throw httpError(404, 'Product not found');
  return rows[0];
}

async function create(data, actorId) {
  return sql.begin(async (tx) => {
    const rows = await tx`
      INSERT INTO products (code, name, unit, price, minimum_stock)
      VALUES (${data.code || null}, ${data.name}, ${data.unit}, ${data.price}, ${data.minimumStock})
      RETURNING id, code, name, unit, price::float8 AS price, minimum_stock::float8 AS "minimumStock", is_active AS "isActive"
    `;
    const product = rows[0];
    if (data.openingStock > 0) {
      await tx`
        INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference_type, operator_id, note)
        VALUES (${product.id}, 'OPENING', ${data.openingStock}, 'PRODUCT', ${actorId}, 'Opening stock')
      `;
    }
    await logActivity(tx, { userId: actorId, action: 'CREATE_PRODUCT', entityType: 'PRODUCT', entityId: product.id, details: { name: product.name } });
    return product;
  });
}

async function update(id, data, actorId) {
  return sql.begin(async (tx) => {
    const rows = await tx`
      UPDATE products SET
        code = ${data.code || null}, name = ${data.name}, unit = ${data.unit},
        price = ${data.price}, minimum_stock = ${data.minimumStock}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, unit, price::float8 AS price, minimum_stock::float8 AS "minimumStock", is_active AS "isActive"
    `;
    if (!rows.length) throw httpError(404, 'Product not found');
    await logActivity(tx, { userId: actorId, action: 'UPDATE_PRODUCT', entityType: 'PRODUCT', entityId: id });
    return rows[0];
  });
}

async function deactivate(id, actorId) {
  return sql.begin(async (tx) => {
    const rows = await tx`UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = ${id} RETURNING id, name`;
    if (!rows.length) throw httpError(404, 'Product not found');
    await logActivity(tx, { userId: actorId, action: 'DEACTIVATE_PRODUCT', entityType: 'PRODUCT', entityId: id });
    return { id, deactivated: true };
  });
}

module.exports = { list, get, create, update, deactivate };
