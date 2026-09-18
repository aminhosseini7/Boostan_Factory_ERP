const sql=require('../../config/database');
async function get(){
 const [prod]=await sql`SELECT COALESCE(SUM(quantity),0)::float8 AS value FROM production_records WHERE production_at::date=CURRENT_DATE`;
 const [sales]=await sql`SELECT COALESCE(SUM(total_amount),0)::float8 AS value FROM sales WHERE sold_at::date=CURRENT_DATE`;
 const [inv]=await sql`SELECT COUNT(*)::int AS "productCount",COALESCE(SUM(stock*price),0)::float8 AS value,COUNT(*) FILTER(WHERE stock<=minimum_stock)::int AS "lowStockCount" FROM v_inventory_stock`;
 const [debt]=await sql`SELECT COALESCE(SUM(balance),0)::float8 AS value FROM v_customer_balances WHERE balance>0`;
 const productionSeries=await sql`SELECT production_at::date AS date,SUM(quantity)::float8 AS total FROM production_records WHERE production_at>=CURRENT_DATE-INTERVAL '29 days' GROUP BY production_at::date ORDER BY date`;
 const salesSeries=await sql`SELECT sold_at::date AS date,SUM(total_amount)::float8 AS total FROM sales WHERE sold_at>=CURRENT_DATE-INTERVAL '29 days' GROUP BY sold_at::date ORDER BY date`;
 const recent=await sql`SELECT al.id,al.action,al.entity_type AS "entityType",al.entity_id AS "entityId",al.details,al.created_at AS "createdAt",u.full_name AS "userName" FROM activity_logs al LEFT JOIN users u ON u.id=al.user_id ORDER BY al.created_at DESC LIMIT 20`;
 return {todayProduction:prod.value,todaySales:sales.value,inventoryProductCount:inv.productCount,inventoryValue:inv.value,lowStockCount:inv.lowStockCount,customerDebt:debt.value,productionSeries,salesSeries,recentActivities:recent};
}
module.exports={get};
