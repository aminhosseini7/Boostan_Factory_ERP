// Phase 6 - Operator sales workflow

function createSaleDraft({
  operatorId,
  customerId,
  items,
  discount = 0
}) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );

  return {
    operatorId,
    customerId,
    items,
    discount,
    totalAmount: subtotal - subtotal * discount / 100,
    createdAt: new Date().toISOString()
  };
}

module.exports = { createSaleDraft };
