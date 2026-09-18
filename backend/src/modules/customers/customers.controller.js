const {z}=require('zod');const s=require('./customers.service');
const schema=z.object({name:z.string().min(1).max(200),phone:z.string().max(50).optional().or(z.literal('')),address:z.string().max(1000).optional().or(z.literal(''))});
async function list(req,res){res.json(await s.list(String(req.query.search||'')));}async function get(req,res){res.json(await s.get(req.params.id));}async function create(req,res){res.status(201).json(await s.create(schema.parse(req.body),req.user.id));}async function update(req,res){res.json(await s.update(req.params.id,schema.parse(req.body),req.user.id));}async function statement(req,res){res.json(await s.statement(req.params.id));}
module.exports={list,get,create,update,statement};
