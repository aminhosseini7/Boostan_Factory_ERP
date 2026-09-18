// Phase 2 - Suppliers foundation

const suppliers = [];

function createSupplier(data) {
  const supplier = {
    id: Date.now().toString(),
    ...data,
    isActive: true
  };
  suppliers.push(supplier);
  return supplier;
}

function listSuppliers() {
  return suppliers;
}

module.exports = { createSupplier, listSuppliers };
