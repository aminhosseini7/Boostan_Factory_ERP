const sql=require('../../config/database');
const httpError=require('../../utils/httpError');
const {logActivity}=require('../../services/activity.service');
const {lockProduct}=require('../../services/inventory.service');

async function create(data,user){
 return sql.begin(async tx=>{
   await lockProduct(tx,data.productId);
   const p=await tx`SELECT id,name,is_active FROM products WHERE id=${data.productId}`;
   if(!p.length||!p[0].is_active) throw httpError(400,'Product is not available');
   const r=await tx`
     INSERT INTO production_records(product_id,operator_id,quantity,shift,production_at,note)
     VALUES(${data.productId},${user.id},${data.quantity},${data.shift},${data.productionAt||new Date()},${data.note||null})
     RETURNING id,product_id AS "productId",operator_id AS "operatorId",quantity::float8 AS quantity,shift,production_at AS "productionAt",note
   `;
   await tx`
     INSERT INTO inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
     VALUES(${data.productId},'PRODUCTION',${data.quantity},'PRODUCTION',${r[0].id},${user.id},${data.productionAt||new Date()},${data.note||null})
   `;
   await logActivity(tx,{userId:user.id,action:'CREATE_PRODUCTION',entityType:'PRODUCTION',entityId:r[0].id,details:{productId:data.productId,quantity:data.quantity,shift:data.shift}});
   return r[0];
 });
}

async function list(user,from,to){
 if(user.role==='MANAGER'){
   return sql`
     SELECT pr.id,pr.product_id AS "productId",p.name AS "productName",pr.operator_id AS "operatorId",u.full_name AS "operatorName",
            pr.quantity::float8 AS quantity,pr.shift,pr.production_at AS "productionAt",pr.note
     FROM production_records pr JOIN products p ON p.id=pr.product_id JOIN users u ON u.id=pr.operator_id
     WHERE (${from||null}::timestamptz IS NULL OR pr.production_at>=${from||null})
       AND (${to||null}::timestamptz IS NULL OR pr.production_at<=${to||null})
     ORDER BY pr.production_at DESC LIMIT 500
   `;
 }
 return sql`
   SELECT pr.id,pr.product_id AS "productId",p.name AS "productName",pr.operator_id AS "operatorId",u.full_name AS "operatorName",
          pr.quantity::float8 AS quantity,pr.shift,pr.production_at AS "productionAt",pr.note
   FROM production_records pr JOIN products p ON p.id=pr.product_id JOIN users u ON u.id=pr.operator_id
   WHERE pr.operator_id=${user.id}
   ORDER BY pr.production_at DESC LIMIT 500
 `;
}
module.exports={create,list};
