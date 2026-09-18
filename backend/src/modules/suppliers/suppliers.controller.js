const service = require('./suppliers.service');

exports.list = (req,res)=>{
  res.json({success:true,data:service.listSuppliers()});
};

exports.create = (req,res)=>{
  res.json({success:true,data:service.createSupplier(req.body)});
};
