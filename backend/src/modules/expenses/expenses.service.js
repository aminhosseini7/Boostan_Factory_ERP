// Phase 2 - Expenses foundation

const expenses = [];

function createExpense(data) {
  const expense = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    ...data
  };
  expenses.push(expense);
  return expense;
}

function listExpenses() {
  return expenses;
}

module.exports = { createExpense, listExpenses };
