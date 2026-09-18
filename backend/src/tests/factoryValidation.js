// Phase 9 - Validation helpers

function validateProduction(record) {
  const total = record.counterEnd - record.counterStart;

  return {
    valid: total >= 0 && record.defects <= total,
    total,
    good: total - record.defects
  };
}


function validateSale(items, discount) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  return {
    subtotal,
    final: subtotal - (subtotal * discount / 100)
  };
}

module.exports = {
  validateProduction,
  validateSale
};
