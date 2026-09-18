const s=require('./dashboard.service');async function get(req,res){res.json(await s.get());}module.exports={get};
