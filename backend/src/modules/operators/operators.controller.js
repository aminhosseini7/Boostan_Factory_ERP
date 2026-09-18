const service = require('./operators.service');

exports.list = (req,res)=>{
  res.json({success:true,data:service.listOperators()});
};

exports.create = (req,res)=>{
  res.json({success:true,data:service.createOperator(req.body)});
};
