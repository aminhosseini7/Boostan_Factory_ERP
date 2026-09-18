const sql=require('../../config/database');
const httpError=require('../../utils/httpError');
const {lockProduct,stockForProduct}=require('../../services/inventory.service');
const {logActivity}=require('../../services/activity.service');
const {defaultPaidAmount,ensurePaymentWithinTotal}=require('../../utils/businessRules');

async function create(data,user){
 return sql.begin(async tx=>{
   const customer=await tx`SELECT id,name,is_active FROM customers WHERE id=${data.customerId}`;
   if(!customer.length||!customer[0].is_active) throw httpError(400,'Customer is not available');

   const ids=[...new Set(data.items.map(i=>i.productId))].sort();
   for(const id of ids) await lockProduct(tx,id);

   const lines=[];
   let total=0;
   for(const item of data.items){
     const products=await tx`SELECT id,name,price::float8 AS price,is_active FROM products WHERE id=${item.productId}`;
     const product=products[0];
     if(!product||!product.is_active) throw httpError(400,'One of the selected products is not available');
     const stock=await stockForProduct(tx,item.productId);
     if(stock<Number(item.quantity)) throw httpError(409,`Insufficient stock for ${product.name}. Available: ${stock}`);
     const unitPrice=item.unitPrice!==undefined?Number(item.unitPrice):Number(product.price);
     const lineTotal=Number(item.quantity)*unitPrice;
     total+=lineTotal;
     lines.push({productId:item.productId,quantity:Number(item.quantity),unitPrice,lineTotal});
   }

   const paid=defaultPaidAmount(data.paymentType,total,data.paymentAmount);
   if(!ensurePaymentWithinTotal(total,paid)) throw httpError(400,'Payment amount must be between zero and total amount');
   if(data.paymentType==='CREDIT'&&paid!==0) throw httpError(400,'Credit sale cannot have an immediate payment');
   if(data.paymentType==='MIXED'&&(paid<=0||paid>=total)) throw httpError(400,'Mixed payment must be greater than zero and less than total');

   const saleRows=await tx`
     INSERT INTO sales(customer_id,operator_id,subtotal,total_amount,payment_type,payment_amount,note,sold_at)
     VALUES(${data.customerId},${user.id},${total},${total},${data.paymentType},${paid},${data.note||null},${data.soldAt||new Date()})
     RETURNING id,customer_id AS "customerId",operator_id AS "operatorId",total_amount::float8 AS "totalAmount",payment_type AS "paymentType",payment_amount::float8 AS "paymentAmount",sold_at AS "soldAt"
   `;
   const sale=saleRows[0];
   for(const line of lines){
     await tx`INSERT INTO sale_items(sale_id,product_id,quantity,unit_price) VALUES(${sale.id},${line.productId},${line.quantity},${line.unitPrice})`;
     await tx`
       INSERT INTO inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
       VALUES(${line.productId},'SALE',${line.quantity},'SALE',${sale.id},${user.id},${data.soldAt||new Date()},${data.note||null})
     `;
   }
   if(paid>0){
     await tx`
       INSERT INTO payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
       VALUES(${data.customerId},${sale.id},${paid},${data.paymentType==='MIXED'?(data.paymentMethod||'OTHER'):data.paymentType},${user.id},${data.soldAt||new Date()},'Payment recorded with sale')
     `;
   }
   await logActivity(tx,{userId:user.id,action:'CREATE_SALE',entityType:'SALE',entityId:sale.id,details:{customerId:data.customerId,total,paymentType:data.paymentType,paid}});
   return {...sale,items:lines,balanceDue:total-paid};
 });
}

async function list(user){
 const base=user.role==='MANAGER'
  ? await sql`SELECT s.id,s.customer_id AS "customerId",c.name AS "customerName",s.operator_id AS "operatorId",u.full_name AS "operatorName",s.total_amount::float8 AS "totalAmount",s.payment_type AS "paymentType",s.payment_amount::float8 AS "paymentAmount",s.sold_at AS "soldAt" FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.operator_id ORDER BY s.sold_at DESC LIMIT 500`
  : await sql`SELECT s.id,s.customer_id AS "customerId",c.name AS "customerName",s.operator_id AS "operatorId",u.full_name AS "operatorName",s.total_amount::float8 AS "totalAmount",s.payment_type AS "paymentType",s.payment_amount::float8 AS "paymentAmount",s.sold_at AS "soldAt" FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.operator_id WHERE s.operator_id=${user.id} ORDER BY s.sold_at DESC LIMIT 500`;
 return base;
}

async function get(id,user){
 let saleRows;
 if(user.role==='MANAGER'){
   saleRows=await sql`SELECT s.id,s.customer_id AS "customerId",c.name AS "customerName",s.operator_id AS "operatorId",u.full_name AS "operatorName",s.total_amount::float8 AS "totalAmount",s.payment_type AS "paymentType",s.payment_amount::float8 AS "paymentAmount",s.note,s.sold_at AS "soldAt" FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.operator_id WHERE s.id=${id}`;
 }else{
   saleRows=await sql`SELECT s.id,s.customer_id AS "customerId",c.name AS "customerName",s.operator_id AS "operatorId",u.full_name AS "operatorName",s.total_amount::float8 AS "totalAmount",s.payment_type AS "paymentType",s.payment_amount::float8 AS "paymentAmount",s.note,s.sold_at AS "soldAt" FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.operator_id WHERE s.id=${id} AND s.operator_id=${user.id}`;
 }
 if(!saleRows.length) throw httpError(404,'Sale not found');
 const items=await sql`SELECT si.product_id AS "productId",p.name AS "productName",si.quantity::float8 AS quantity,si.unit_price::float8 AS "unitPrice",(si.quantity*si.unit_price)::float8 AS "lineTotal" FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=${id}`;
 return {...saleRows[0],items};
}
module.exports={create,list,get};
