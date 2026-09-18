const sql=require('../../config/database');
const httpError=require('../../utils/httpError');
const {logActivity}=require('../../services/activity.service');
async function list(search=''){
  const p=`%${search}%`;
  return sql`SELECT id,name,phone,address,is_active AS "isActive",created_at AS "createdAt" FROM customers WHERE (${search}='' OR name ILIKE ${p} OR COALESCE(phone,'') ILIKE ${p}) ORDER BY is_active DESC,name`;
}
async function get(id){const r=await sql`SELECT id,name,phone,address,is_active AS "isActive",created_at AS "createdAt" FROM customers WHERE id=${id}`;if(!r.length)throw httpError(404,'Customer not found');return r[0];}
async function create(data,userId){return sql.begin(async tx=>{const r=await tx`INSERT INTO customers(name,phone,address) VALUES(${data.name},${data.phone||null},${data.address||null}) RETURNING id,name,phone,address,is_active AS "isActive"`;await logActivity(tx,{userId,action:'CREATE_CUSTOMER',entityType:'CUSTOMER',entityId:r[0].id,details:{name:data.name}});return r[0];});}
async function update(id,data,userId){return sql.begin(async tx=>{const r=await tx`UPDATE customers SET name=${data.name},phone=${data.phone||null},address=${data.address||null},updated_at=NOW() WHERE id=${id} RETURNING id,name,phone,address,is_active AS "isActive"`;if(!r.length)throw httpError(404,'Customer not found');await logActivity(tx,{userId,action:'UPDATE_CUSTOMER',entityType:'CUSTOMER',entityId:id});return r[0];});}
async function statement(id){
  const customer=await get(id);
  const sales=await sql`SELECT id,total_amount::float8 AS "totalAmount",payment_type AS "paymentType",payment_amount::float8 AS "paymentAmount",sold_at AS "soldAt" FROM sales WHERE customer_id=${id} ORDER BY sold_at DESC`;
  const payments=await sql`SELECT id,sale_id AS "saleId",amount::float8 AS amount,payment_method AS "paymentMethod",paid_at AS "paidAt",note FROM payments WHERE customer_id=${id} ORDER BY paid_at DESC`;
  const b=await sql`SELECT COALESCE(balance,0)::float8 AS balance FROM v_customer_balances WHERE customer_id=${id}`;
  return {customer,sales,payments,balance:b[0]?.balance||0};
}
module.exports={list,get,create,update,statement};
