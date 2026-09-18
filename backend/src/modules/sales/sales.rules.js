// Phase 5 - Sales business rules

function calculateSale(items, discount = 0) {
  const subtotal = items.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice),
    0
  );

  const finalAmount = subtotal - (subtotal * discount / 100);

  return {
    subtotal,
    discount,
    finalAmount
  };
}

module.exports = { calculateSale };
