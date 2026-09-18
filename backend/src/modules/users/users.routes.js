const router = require('express').Router();
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const c = require('./users.controller');

router.use(auth, authorize('MANAGER'));
router.get('/', asyncHandler(c.list));
router.post('/', asyncHandler(c.create));
router.patch('/:id/active', asyncHandler(c.setActive));
module.exports = router;
