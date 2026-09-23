-- Boostan ERP
-- Fix material mix view replacement
-- Existing view has old column order, so drop and recreate is required.

drop view if exists v_factory_material_mix;

create view v_factory_material_mix as
with settings as (
  select coalesce(
    (select mix_period_days from standard_cost_settings limit 1),
    14
  ) as days
),
raw_flow as (
  select
    coalesce(sum(p.quantity),0)::numeric as raw_kg
  from purchases p
  cross join settings s
  where p.purchase_type='RAW_MATERIAL'
    and p.purchased_at >= now() - (s.days || ' days')::interval
),
grinding_flow as (
  select
    coalesce(sum(g.total_weight),0)::numeric as grind_kg
  from grinding_records g
  cross join settings s
  where g.created_at >= now() - (s.days || ' days')::interval
)
select
  r.raw_kg,
  g.grind_kg,
  case
    when r.raw_kg + g.grind_kg > 0
    then r.raw_kg / (r.raw_kg + g.grind_kg)
    else 1
  end as raw_ready_pct,
  case
    when r.raw_kg + g.grind_kg > 0
    then g.grind_kg / (r.raw_kg + g.grind_kg)
    else 0
  end as scrap_grind_pct
from raw_flow r
cross join grinding_flow g;
