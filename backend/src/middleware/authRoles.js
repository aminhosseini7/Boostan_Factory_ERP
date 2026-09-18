// Phase 8 - Authorization middleware foundation

const { can } = require('./permissions');

function authorize(permission) {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!can(role, permission)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    next();
  };
}

module.exports = authorize;
