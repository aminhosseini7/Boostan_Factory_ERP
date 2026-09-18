const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const auth = require('../../middleware/auth');
const { loginLimiter } = require('../../middleware/rateLimits');
const controller = require('./auth.controller');

router.post('/login', loginLimiter, asyncHandler(controller.login));
router.get('/me', auth, asyncHandler(controller.me));

module.exports = router;
