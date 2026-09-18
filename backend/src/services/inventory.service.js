async function stockForProduct(sql, productId) {
  const rows = await sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING','PRODUCTION','ADJUSTMENT_IN') THEN quantity
        WHEN transaction_type IN ('SALE','ADJUSTMENT_OUT') THEN -quantity
        ELSE 0
      END
    ), 0)::numeric AS stock
    FROM inventory_transactions
    WHERE product_id = ${productId}
  `;
  return Number(rows[0].stock || 0);
}

async function lockProduct(sql, productId) {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${String(productId)}))`;
}

module.exports = { stockForProduct, lockProduct };
