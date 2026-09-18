// Phase 5 - Customer credit ledger foundation

function createLedgerEntry({
  customerId,
  type,
  amount,
  referenceId
}) {
  return {
    customerId,
    type,
    amount,
    referenceId,
    createdAt: new Date().toISOString()
  };
}

module.exports = { createLedgerEntry };
