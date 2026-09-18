const { z } = require('zod');
const service = require('./users.service');

const createSchema = z.object({
  username: z.string().min(3).max(80),
  fullName: z.string().min(2).max(150),
  password: z.string().min(8).max(200),
  role: z.enum(['MANAGER', 'OPERATOR'])
});

async function list(req, res) { res.json(await service.list()); }
async function create(req, res) { res.status(201).json(await service.create(createSchema.parse(req.body), req.user.id)); }
async function setActive(req, res) {
  const body = z.object({ isActive: z.boolean() }).parse(req.body);
  res.json(await service.setActive(req.params.id, body.isActive, req.user.id));
}

module.exports = { list, create, setActive };
