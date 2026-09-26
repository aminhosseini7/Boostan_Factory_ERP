-- Boostan update 2026-09-26 verification (READ ONLY)
-- Run only AFTER applying migration 202609260001_sales_stock_and_cleaning_rotation.sql.

-- 1) Rotation configuration and expected first/second/third 10-day blocks.
select u.username,u.full_name,w.initial_zone,
       boostan_cleaning_zone(u.id,date '2026-09-27') as zone_1405_07_05,
       boostan_cleaning_zone(u.id,date '2026-10-07') as zone_block_2,
       boostan_cleaning_zone(u.id,date '2026-10-17') as zone_block_3,
       boostan_cleaning_zone(u.id,date '2026-10-27') as zone_cycle_repeat
from cleaning_rotation_workers w
join users u on u.id=w.user_id
order by w.initial_zone;

-- Expected:
-- kamran   1,2,3,1
-- hasan    2,3,1,2
-- mohammad 3,1,2,3

-- 2) Shift columns / current manager view.
select column_name,data_type
from information_schema.columns
where table_schema='public' and table_name='shift_runs'
  and column_name in ('cleaning_zone','cleaning_done','cleaning_confirmed_at','cleaning_confirmed_by')
order by column_name;

-- 3) Ensure API-facing views expose code + cleaning state.
select table_name,column_name
from information_schema.columns
where table_schema='public'
  and table_name in ('v_shift_runs','v_production_summary')
  and column_name in ('product_code','cleaning_zone','cleaning_done','cleaning_confirmed_at')
order by table_name,column_name;

-- 4) Verify the active sale functions no longer contain the two hard stock-block messages.
select p.proname,
       position('موجودی ثبت‌شده برای این فروش کافی نیست' in pg_get_functiondef(p.oid))=0 as create_sale_stock_block_removed,
       position('موجودی ثبت‌شده برای اصلاح این فروش کافی نیست' in pg_get_functiondef(p.oid))=0 as edit_sale_stock_block_removed
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('boostan_create_sale','boostan_manager_edit_sale')
order by p.proname;

-- 5) Recent shifts: green/orange source fields for manager UI.
select shift_date,shift_code,operator_name,product_code,cleaning_zone,cleaning_done,cleaning_confirmed_at,status
from v_shift_runs
order by started_at desc
limit 30;
