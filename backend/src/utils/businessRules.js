function defaultPaidAmount(paymentType, totalAmount, suppliedAmount) {
  const total = Number(totalAmount || 0);
  if (suppliedAmount !== undefined && suppliedAmount !== null && suppliedAmount !== '') {
    return Number(suppliedAmount);
  }
  return paymentType === 'CASH' || paymentType === 'CARD' ? total : 0;
}

function ensurePaymentWithinTotal(totalAmount, paidAmount) {
  const total = Number(totalAmount);
  const paid = Number(paidAmount);
  return Number.isFinite(total) && Number.isFinite(paid) && paid >= 0 && paid <= total;
}

module.exports = { defaultPaidAmount, ensurePaymentWithinTotal };
