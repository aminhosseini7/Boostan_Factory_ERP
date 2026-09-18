const router = require('express').Router();
const controller = require('./suppliers.controller');

router.get('/', controller.list);
router.post('/', controller.create);

module.exports = router;
