const router = require('express').Router();
const controller = require('./products.controller');

router.get('/', controller.getProducts);
router.post('/', controller.createProduct);

module.exports = router;
