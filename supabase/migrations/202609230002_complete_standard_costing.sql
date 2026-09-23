-- Boostan ERP Complete Standard Current Costing Engine
-- Phase 2

create table if not exists factory_cost_rates (
  id uuid primary key default gen_random_uuid(),
  rate_type text not null,
  value numeric not null default 0,
  unit text not null default 'PER_MINUTE',
  effective_from timestamptz default now(),
  created_at timestamptz default now()
);

create or replace view v_standard_factory_rates as
select
  coalesce(sum(case when rate_type='PRODUCTION_PER_MINUTE' then value else 0 end),0)
  as production_cost_per_minute
from factory_cost_rates;

create or replace view v_standard_material_weighted_cost as
select
  p.id as product_id,
  coalesce(m.raw_ready_pct,100) as raw_ready_pct,
  coalesce(m.scrap_grind_pct,0) as scrap_grind_pct,
  (
    coalesce(m.raw_ready_pct,100) * c.raw_ready_cost / 100
    +
    coalesce(m.scrap_grind_pct,0) * c.scrap_grind_cost / 100
  ) as material_cost_kg
from products p
left join product_material_mix m on m.product_id=p.id
cross join v_standard_material_cost c;
