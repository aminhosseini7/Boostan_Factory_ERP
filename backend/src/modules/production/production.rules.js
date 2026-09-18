// Phase 5 - Production business rules

function calculateProduction(counterStart, counterEnd, defects) {
  if (counterEnd < counterStart) {
    throw new Error('Ending counter cannot be lower than starting counter');
  }

  const total = counterEnd - counterStart;
  const good = total - defects;

  if (good < 0) {
    throw new Error('Defects cannot exceed total production');
  }

  return {
    totalQuantity: total,
    defectQuantity: defects,
    goodQuantity: good
  };
}

module.exports = { calculateProduction };
