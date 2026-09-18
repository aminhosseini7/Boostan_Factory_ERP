const router = require('express').Router();
const controller = require('./operators.controller');

router.get('/', controller.list);
router.post('/', controller.create);

module.exports = router;
