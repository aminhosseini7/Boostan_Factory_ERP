const service = require('./settings.service');

exports.getSettings = (req, res) => {
  res.json({ success: true, data: service.getAllSettings() });
};

exports.updateSetting = (req, res) => {
  const result = service.updateSetting(req.params.key, req.body.value);
  res.json({ success: true, data: result });
};
