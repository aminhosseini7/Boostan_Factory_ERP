const {z}=require('zod');const s=require('./production.service');
const schema=z.object({productId:z.string().uuid(),quantity:z.coerce.number().positive(),shift:z.enum(['MORNING','EVENING','NIGHT']),productionAt:z.string().datetime().optional(),note:z.string().max(1000).optional().or(z.literal(''))});
async function create(req,res){res.status(201).json(await s.create(schema.parse(req.body),req.user));}
async function list(req,res){res.json(await s.list(req.user,req.query.from,req.query.to));}
module.exports={create,list};
