const sql=require('../../config/database');
const {logActivity}=require('../../services/activity.service');
const {lockProduct,stockForProduct}=require('../../services/inventory.service');
const httpError=require('../../utils/httpError');

async function current(){
 return sql`SELECT product_id AS "productId",code,name,unit,price::float8 AS price,minimum_stock::float8 AS "minimumStock",stock::float8 AS stock,(stock*price)::float8 AS "stockValue" FROM v_inventory_stock ORDER BY name`;
}
async function low(){return sql`SELECT product_id AS "productId",code,name,unit,minimum_stock::float8 AS "minimumStock",stock::float8 AS stock FROM v_inventory_stock WHERE stock<=minimum_stock ORDER BY (minimum_stock-stock) DESC,name`;}
async function movement(productId){return sql`SELECT it.id,it.product_id AS "productId",p.name AS "productName",it.transaction_type AS "transactionType",it.quantity::float8 AS quantity,it.reference_type AS "referenceType",it.reference_id AS "referenceId",it.occurred_at AS "occurredAt",it.note,u.full_name AS "operatorName" FROM inventory_transactions it JOIN products p ON p.id=it.product_id LEFT JOIN users u ON u.id=it.operator_id WHERE it.product_id=${productId} ORDER BY it.occurred_at DESC LIMIT 1000`;}
async function adjust(data,userId){return sql.begin(async tx=>{await lockProduct(tx,data.productId);if(data.direction==='OUT'){const stock=await stockForProduct(tx,data.productId);if(stock<Number(data.quantity))throw httpError(409,`Insufficient stock. Available: ${stock}`);}const r=await tx`INSERT INTO inventory_transactions(product_id,transaction_type,quantity,reference_type,operator_id,occurred_at,note) VALUES(${data.productId},${data.direction==='IN'?'ADJUSTMENT_IN':'ADJUSTMENT_OUT'},${data.quantity},'ADJUSTMENT',${userId},${data.occurredAt||new Date()},${data.note}) RETURNING id,product_id AS "productId",transaction_type AS "transactionType",quantity::float8 AS quantity,occurred_at AS "occurredAt",note`;await logActivity(tx,{userId,action:'INVENTORY_ADJUSTMENT',entityType:'INVENTORY',entityId:r[0].id,details:{productId:data.productId,direction:data.direction,quantity:data.quantity}});return r[0];});}
module.exports={current,low,movement,adjust};
