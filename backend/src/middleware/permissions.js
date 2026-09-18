// Phase 8 - Role based permissions foundation

const permissions = {
  MANAGER: [
    "dashboard:view",
    "products:manage",
    "prices:manage",
    "inventory:view",
    "sales:view",
    "customers:manage",
    "settings:manage"
  ],

  OPERATOR: [
    "shift:start",
    "production:create",
    "defects:create",
    "sales:create"
  ]
};

function can(role, permission) {
  return permissions[role]?.includes(permission) || false;
}

module.exports = { permissions, can };
