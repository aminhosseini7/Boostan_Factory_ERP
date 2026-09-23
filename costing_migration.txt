-- Boostan ERP Standard Current Costing Engine
-- Phase: Standard Current Costing foundation

alter table products
add column if not exists standard_minutes numeric default 0;

create table if not exists product_material_mix (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references products(id) on delete cascade,
 raw_ready_pct numeric not null default 100,
 scrap_grind_pct numeric not null default 0,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 unique(product_id)
);

create or replace view v_standard_material_cost as
with raw as (
 select
  coalesce(sum(total_amount),0) total,
  coalesce(sum(weight_kg),0) kg
 from purchases
 where purchase_type='RAW_MATERIAL'
),
scrap_purchase as (
 select
  coalesce(sum(total_amount),0) total,
  coalesce(sum(weight_kg),0) kg
 from purchases
 where purchase_type='USED_SCRAP'
),
grind as (
 select
  coalesce(sum(labor_cost),0) total,
  coalesce(sum(total_weight),0) kg
 from grinding_records
)
select
 case when raw.kg>0 then raw.total/raw.kg else 0 end as raw_ready_cost,
 case when scrap_purchase.kg+grind.kg>0
 then (scrap_purchase.total+grind.total)/(scrap_purchase.kg+grind.kg)
 else 0 end as scrap_grind_cost
from raw,scrap_purchase,grind;

create or replace view v_standard_defect_rate as
select
 case when sum(gross_quantity)>0
 then sum(defects)/sum(gross_quantity)
 else 0 end as defect_rate
from v_production_summary;
