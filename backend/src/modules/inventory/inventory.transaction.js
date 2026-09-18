// Phase 5 - Inventory transaction foundation

const TYPES = {
  OPENING: 'OPENING_BALANCE',
  PRODUCTION_IN: 'PRODUCTION_IN',
  SALE_OUT: 'SALE_OUT',
  PURCHASE_IN: 'PURCHASE_IN',
  ADJUSTMENT: 'ADJUSTMENT'
};

function createInventoryTransaction({
  productId,
  type,
  quantity,
  referenceId
}) {
  return {
    productId,
    type,
    quantity,
    referenceId,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  TYPES,
  createInventoryTransaction
};
