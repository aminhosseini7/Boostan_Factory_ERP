const { z } = require('zod');
const service = require('./auth.service');

const loginSchema = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) });

async function login(req, res) {
  const data = loginSchema.parse(req.body);
  res.json(await service.login(data.username, data.password));
}

async function me(req, res) {
  res.json(await service.me(req.user.id));
}

module.exports = { login, me };
