// Phase 6 - Operator production workflow

function startShift({operatorId, shiftId, productId, counterStart}) {
  return {
    operatorId,
    shiftId,
    productId,
    counterStart,
    startedAt: new Date().toISOString()
  };
}

function closeShift({record, counterEnd, defects}) {
  if (counterEnd < record.counterStart) {
    throw new Error("Invalid counter");
  }

  const total = counterEnd - record.counterStart;

  return {
    ...record,
    counterEnd,
    defects,
    totalProduction: total,
    goodProduction: total - defects,
    closedAt: new Date().toISOString()
  };
}

module.exports = {
  startShift,
  closeShift
};
