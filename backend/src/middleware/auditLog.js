// Phase 8 - Audit log foundation

function createAuditEntry({
  userId,
  action,
  module,
  referenceId
}) {
  return {
    userId,
    action,
    module,
    referenceId,
    createdAt: new Date().toISOString()
  };
}

module.exports = { createAuditEntry };
