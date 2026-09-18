// Phase 2 - Operators foundation

const operators = [];

function createOperator(data) {
  const operator = {
    id: Date.now().toString(),
    ...data,
    isActive: true
  };
  operators.push(operator);
  return operator;
}

function listOperators() {
  return operators;
}

module.exports = { createOperator, listOperators };
