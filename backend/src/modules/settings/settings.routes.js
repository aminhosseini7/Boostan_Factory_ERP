const router = require('express').Router();
const controller = require('./settings.controller');

router.get('/', controller.getSettings);
router.put('/:key', controller.updateSetting);

module.exports = router;
