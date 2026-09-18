const { z } = require('zod');
const service = require('./products.service');
const schema = z.object({
  code: z.string().max(100).optional().or(z.literal('')),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  price: z.coerce.number().nonnegative(),
  minimumStock: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative().default(0)
});
async function list(req,res){ res.json(await service.list(String(req.query.search || ''))); }
async function get(req,res){ res.json(await service.get(req.params.id)); }
async function create(req,res){ res.status(201).json(await service.create(schema.parse(req.body), req.user.id)); }
async function update(req,res){ const data=schema.omit({openingStock:true}).parse(req.body); res.json(await service.update(req.params.id,data,req.user.id)); }
async function deactivate(req,res){ res.json(await service.deactivate(req.params.id,req.user.id)); }
module.exports={list,get,create,update,deactivate};
