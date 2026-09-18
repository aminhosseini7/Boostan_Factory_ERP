const service = require('./expenses.service');

exports.list = (req,res)=>{
  res.json({success:true,data:service.listExpenses()});
};

exports.create = (req,res)=>{
  res.json({success:true,data:service.createExpense(req.body)});
};
