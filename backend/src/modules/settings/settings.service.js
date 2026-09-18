// Phase 2 - Factory settings foundation
const settings = new Map();

function getSetting(key) {
  return settings.get(key);
}

function updateSetting(key, value) {
  settings.set(key, value);
  return { key, value };
}

module.exports = { getSetting, updateSetting };
