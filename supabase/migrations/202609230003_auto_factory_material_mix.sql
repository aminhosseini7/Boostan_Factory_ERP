-- Boostan ERP - Automatic Factory Material Mix Calculation
-- Global factory mix based on recent material flows

create table if not exists standard_cost_settings (
  id uuid primary key default gen_random_uuid(),
  mix_period_days integer not null default 30,
  updated_at timestamptz default now()
);

insert into standard_cost_settings(mix_period_days)
select 30
where not exists(select 1 from standard_cost_settings);

create or replace view v_factory_material_mix as
with flows as (
  select
    coalesce(sum(case when purchase_type='RAW_MATERIAL' then weight_kg else 0 end),0) as raw_kg,
    coalesce(sum(case when purchase_type='USED_SCRAP' then weight_kg else 0 end),0) as scrap_kg
  from purchases
  where created_at >= now() -
    ((select mix_period_days from standard_cost_settings limit 1) || ' days')::interval
),
total as (
 select *, raw_kg + scrap_kg as total_kg from flows
)
select
 case when total_kg > 0 then raw_kg/total_kg else 1 end as raw_ready_pct,
 case when total_kg > 0 then scrap_kg/total_kg else 0 end as scrap_grind_pct
from total;
