-- Boostan Factory ERP v2.2 - material flow, grinding economics, traceability and management ledger
-- Non-destructive migration.
begin;

alter table purchases add column if not exists weight_kg numeric(18,3) not null default 0 check (weight_kg >= 0);
alter table purchases add column if not exists inventory_material_id uuid;

alter table grinding_records add column if not exists bag_count integer not null default 0 check (bag_count >= 0);
alter table grinding_records add column if not exists bag_weight_kg numeric(18,3) not null default 0 check (bag_weight_kg >= 0);
alter table grinding_records add column if not exists cost_mode varchar(20) not null default 'DAILY' check (cost_mode in ('DAILY','PER_KG'));
alter table grinding_records add column if not exists daily_cost numeric(18,2) not null default 0 check (daily_cost >= 0);
alter table grinding_records add column if not exists cost_per_kg numeric(18,2) not null default 0 check (cost_per_kg >= 0);
alter table grinding_records add column if not exists input_material_id uuid;
alter table grinding_records add column if not exists output_material_id uuid;

create table if not exists material_items (
  id uuid primary key default gen_random_uuid(),
  code varchar(80) not null unique,
  name varchar(200) not null,
  material_type varchar(30) not null check (material_type in ('RAW_MATERIAL','GRINDABLE_SCRAP','ADDITIVE','OTHER')),
  unit varchar(30) not null default 'کیلوگرم',
  minimum_stock_kg numeric(18,3) not null default 0 check (minimum_stock_kg >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_transactions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references material_items(id),
  transaction_type varchar(40) not null check (transaction_type in (
    'OPENING','PURCHASE','GRINDING_IN','GRINDING_OUT','PRODUCTION_CONSUMPTION','PRODUCTION_SCRAP','ADJUSTMENT_IN','ADJUSTMENT_OUT'
  )),
  quantity_kg numeric(18,3) not null check (quantity_kg > 0),
  unit_cost numeric(18,4),
  reference_type varchar(50),
  reference_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references users(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_material_tx_material_date on material_transactions(material_id,occurred_at desc);
create index if not exists idx_material_tx_reference on material_transactions(reference_type,reference_id);

create table if not exists financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_kind varchar(40) not null check (entry_kind in ('SALE_REVENUE','SALE_RETURN','CUSTOMER_RECEIPT','PURCHASE_COST','FACTORY_EXPENSE','GRINDING_COST','REFUND','OTHER')),
  direction varchar(10) not null check (direction in ('IN','OUT')),
  amount numeric(18,2) not null check (amount >= 0),
  cash_effect boolean not null default false,
  source_type varchar(50) not null,
  source_id uuid,
  occurred_at timestamptz not null default now(),
  created_by uuid references users(id),
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_financial_entries_date on financial_entries(occurred_at desc);
create index if not exists idx_financial_entries_source on financial_entries(source_type,source_id);

insert into material_items(code,name,material_type,minimum_stock_kg)
values
('RAW-READY','مواد اولیه آماده تولید','RAW_MATERIAL',0),
('SCRAP-GRIND','ضایعات قابل آسیاب','GRINDABLE_SCRAP',0)
on conflict (code) do nothing;

alter table purchases drop constraint if exists purchases_inventory_material_id_fkey;
alter table purchases add constraint purchases_inventory_material_id_fkey foreign key (inventory_material_id) references material_items(id) on delete set null;
alter table grinding_records drop constraint if exists grinding_records_input_material_id_fkey;
alter table grinding_records add constraint grinding_records_input_material_id_fkey foreign key (input_material_id) references material_items(id) on delete set null;
alter table grinding_records drop constraint if exists grinding_records_output_material_id_fkey;
alter table grinding_records add constraint grinding_records_output_material_id_fkey foreign key (output_material_id) references material_items(id) on delete set null;

create or replace view v_material_stock as
select m.id as material_id,m.code,m.name,m.material_type,m.unit,m.minimum_stock_kg,m.is_active,
       coalesce(sum(case
         when t.transaction_type in ('OPENING','PURCHASE','GRINDING_IN','PRODUCTION_SCRAP','ADJUSTMENT_IN') then t.quantity_kg
         when t.transaction_type in ('GRINDING_OUT','PRODUCTION_CONSUMPTION','ADJUSTMENT_OUT') then -t.quantity_kg
         else 0 end),0)::numeric as stock_kg
from material_items m
left join material_transactions t on t.material_id=m.id
group by m.id,m.code,m.name,m.material_type,m.unit,m.minimum_stock_kg,m.is_active;

create or replace function boostan_material_id(p_code text) returns uuid language sql stable as $$
  select id from material_items where code=p_code limit 1;
$$;

create or replace function boostan_material_stock(p_material uuid) returns numeric language sql stable as $$
  select coalesce(stock_kg,0) from v_material_stock where material_id=p_material;
$$;

create or replace function boostan_set_material_actual(p_material uuid,p_actual numeric,p_actor uuid,p_note text)
returns jsonb language plpgsql as $$
declare v_stock numeric; v_delta numeric; v_type text; v_id uuid;
begin
  if p_actual<0 then raise exception 'Actual material stock cannot be negative'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Reason is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_material::text));
  if not exists(select 1 from material_items where id=p_material and is_active=true) then raise exception 'Material is not available'; end if;
  v_stock:=coalesce(boostan_material_stock(p_material),0); v_delta:=p_actual-v_stock;
  if v_delta=0 then return jsonb_build_object('materialId',p_material,'previousStock',v_stock,'actualStock',p_actual,'difference',0); end if;
  v_type:=case when v_delta>0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end;
  insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,occurred_at,created_by,note)
  values(p_material,v_type,abs(v_delta),'STOCKTAKE',now(),p_actor,p_note) returning id into v_id;
  perform boostan_log(p_actor,'SET_ACTUAL_MATERIAL_STOCK','MATERIAL_INVENTORY',v_id,jsonb_build_object('materialId',p_material,'previousStock',v_stock,'actualStock',p_actual,'difference',v_delta));
  return jsonb_build_object('id',v_id,'materialId',p_material,'previousStock',v_stock,'actualStock',p_actual,'difference',v_delta,'transactionType',v_type);
end; $$;

-- Purchase: kg and price/kg are explicitly retained for raw material / used scrap.
create or replace function boostan_create_purchase(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_id uuid; v_product uuid:=nullif(p_payload->>'productId','')::uuid; v_material uuid:=nullif(p_payload->>'materialId','')::uuid;
  v_type text:=upper(coalesce(p_payload->>'purchaseType','OTHER'));
  v_qty numeric:=coalesce(nullif(p_payload->>'quantity','')::numeric,0);
  v_weight numeric:=coalesce(nullif(p_payload->>'weightKg','')::numeric,0);
  v_price numeric:=coalesce(nullif(p_payload->>'unitPrice','')::numeric,0);
  v_name text:=trim(coalesce(p_payload->>'itemName','')); v_unit text:=coalesce(nullif(p_payload->>'unit',''),'کیلوگرم');
  v_tx_qty numeric; v_default uuid;
begin
  if v_type not in ('RAW_MATERIAL','FINISHED_PRODUCT','USED_SCRAP','OTHER') then raise exception 'Invalid purchase type'; end if;
  if v_name='' or v_price<0 then raise exception 'Purchase data is invalid'; end if;
  if v_type in ('RAW_MATERIAL','USED_SCRAP') then
    if v_weight<=0 then v_weight:=v_qty; end if;
    if v_weight<=0 then raise exception 'Weight in kg is required'; end if;
    v_qty:=v_weight; v_unit:='کیلوگرم';
    v_default:=boostan_material_id(case when v_type='USED_SCRAP' then 'SCRAP-GRIND' else 'RAW-READY' end);
    v_material:=coalesce(v_material,v_default);
    if v_material is null then raise exception 'Material inventory is not configured'; end if;
  elsif v_type='FINISHED_PRODUCT' then
    if v_product is null then raise exception 'Finished product purchase must select a product'; end if;
    if v_qty<=0 then raise exception 'Quantity is required'; end if;
    if v_weight<=0 then select v_qty*weight_kg into v_weight from products where id=v_product; end if;
  else
    if v_qty<=0 and v_weight<=0 then raise exception 'Quantity or weight is required'; end if;
    if v_qty<=0 then v_qty:=v_weight; v_unit:='کیلوگرم'; end if;
  end if;

  insert into purchases(purchase_type,supplier_name,item_name,product_id,quantity,unit,unit_price,weight_kg,inventory_material_id,purchased_at,note,created_by)
  values(v_type,nullif(p_payload->>'supplierName',''),v_name,v_product,v_qty,v_unit,v_price,v_weight,v_material,now(),nullif(p_payload->>'note',''),p_actor)
  returning id into v_id;

  if v_type='FINISHED_PRODUCT' and v_product is not null then
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values(v_product,'ADJUSTMENT_IN',v_qty,'PURCHASE',v_id,p_actor,now(),'خرید سبد/محصول آماده');
  elsif v_material is not null and v_weight>0 then
    v_tx_qty:=v_weight;
    insert into material_transactions(material_id,transaction_type,quantity_kg,unit_cost,reference_type,reference_id,occurred_at,created_by,note)
    values(v_material,'PURCHASE',v_tx_qty,v_price,'PURCHASE',v_id,now(),p_actor,v_name);
  end if;
  perform boostan_log(p_actor,'CREATE_PURCHASE','PURCHASE',v_id,jsonb_build_object('purchaseType',v_type,'quantity',v_qty,'weightKg',v_weight,'unitPrice',v_price,'materialId',v_material));
  return jsonb_build_object('id',v_id,'purchaseType',v_type,'quantity',v_qty,'weightKg',v_weight,'unitPrice',v_price,'totalAmount',v_qty*v_price,'materialId',v_material);
end; $$;

create or replace function boostan_create_grinding(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_id uuid; v_bags integer:=coalesce(nullif(p_payload->>'bagCount','')::integer,0);
  v_bag_weight numeric:=coalesce(nullif(p_payload->>'bagWeightKg','')::numeric,0);
  v_weight numeric; v_mode text:=upper(coalesce(p_payload->>'costMode','DAILY'));
  v_daily numeric:=coalesce(nullif(p_payload->>'dailyCost','')::numeric,0);
  v_perkg numeric:=coalesce(nullif(p_payload->>'costPerKg','')::numeric,0); v_cost numeric;
  v_input uuid:=coalesce(nullif(p_payload->>'inputMaterialId','')::uuid,boostan_material_id('SCRAP-GRIND'));
  v_output uuid:=coalesce(nullif(p_payload->>'outputMaterialId','')::uuid,boostan_material_id('RAW-READY'));
  v_stock numeric;
begin
  if v_bags<=0 or v_bag_weight<=0 then raise exception 'Bag count and bag weight are required'; end if;
  if v_mode not in ('DAILY','PER_KG') then raise exception 'Invalid grinding cost mode'; end if;
  v_weight:=v_bags*v_bag_weight;
  v_cost:=case when v_mode='PER_KG' then v_weight*v_perkg else v_daily end;
  if v_cost<0 then raise exception 'Grinding cost is invalid'; end if;
  if v_input is null or v_output is null then raise exception 'Grinding material inventories are not configured'; end if;
  perform pg_advisory_xact_lock(hashtext(v_input::text));
  v_stock:=coalesce(boostan_material_stock(v_input),0);
  if v_stock<v_weight then raise exception 'Grindable scrap stock is insufficient. Correct material inventory first.'; end if;

  insert into grinding_records(defective_count,approx_weight_each,labor_cost,bag_count,bag_weight_kg,cost_mode,daily_cost,cost_per_kg,input_material_id,output_material_id,ground_at,note,created_by)
  values(v_bags,v_bag_weight,v_cost,v_bags,v_bag_weight,v_mode,v_daily,v_perkg,v_input,v_output,now(),nullif(p_payload->>'note',''),p_actor)
  returning id into v_id;
  insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
  values(v_input,'GRINDING_OUT',v_weight,'GRINDING',v_id,now(),p_actor,'خروج ضایعات برای آسیاب');
  insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
  values(v_output,'GRINDING_IN',v_weight,'GRINDING',v_id,now(),p_actor,'ورود مواد آسیاب‌شده به مواد اولیه آماده');
  perform boostan_log(p_actor,'CREATE_GRINDING','GRINDING',v_id,jsonb_build_object('bagCount',v_bags,'bagWeightKg',v_bag_weight,'totalWeightKg',v_weight,'costMode',v_mode,'totalCost',v_cost));
  return jsonb_build_object('id',v_id,'bagCount',v_bags,'bagWeightKg',v_bag_weight,'totalWeightKg',v_weight,'costMode',v_mode,'dailyCost',v_daily,'costPerKg',v_perkg,'totalCost',v_cost,'groundAt',now());
end; $$;

-- Production finalization now moves estimated material weight as well as finished baskets.
create or replace function boostan_finalize_shift_run(p_run_id uuid)
returns jsonb language plpgsql as $$
declare
  r shift_runs%rowtype; v_shift_code text; v_prod uuid; v_good numeric; v_weight numeric:=0;
  v_raw uuid; v_scrap uuid; v_consumed numeric; v_scrap_kg numeric;
begin
  select * into r from shift_runs where id=p_run_id for update;
  if not found then raise exception 'Shift run not found'; end if;
  if r.status='FINALIZED' then return to_jsonb(r); end if;
  if r.end_counter is null or r.defects is null then return to_jsonb(r); end if;
  if r.end_counter < r.start_counter then raise exception 'Counter cannot go backwards'; end if;
  r.gross_quantity:=r.end_counter-r.start_counter;
  if r.defects<0 or r.defects>r.gross_quantity then raise exception 'Defective count is invalid'; end if;
  v_good:=r.gross_quantity-r.defects;
  select code into v_shift_code from shifts where id=r.shift_id;
  select coalesce(weight_kg,0) into v_weight from products where id=r.product_id;
  v_raw:=boostan_material_id('RAW-READY'); v_scrap:=boostan_material_id('SCRAP-GRIND');

  if r.production_record_id is null then
    insert into production_records(product_id,operator_id,shift_run_id,quantity,gross_quantity,defects,shift,production_at,note)
    values(r.product_id,r.operator_id,r.id,v_good,r.gross_quantity,r.defects,v_shift_code,coalesce(r.defect_recorded_at,r.started_at),r.note)
    returning id into v_prod;
    if v_good>0 then
      insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
      values(r.product_id,'PRODUCTION',v_good,'SHIFT_RUN',r.id,r.operator_id,coalesce(r.defect_recorded_at,r.started_at),r.note);
    end if;
    if v_weight>0 then
      v_consumed:=r.gross_quantity*v_weight; v_scrap_kg:=r.defects*v_weight;
      if v_raw is not null and v_consumed>0 and not exists(select 1 from material_transactions where reference_type='SHIFT_RUN' and reference_id=r.id and transaction_type='PRODUCTION_CONSUMPTION') then
        insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
        values(v_raw,'PRODUCTION_CONSUMPTION',v_consumed,'SHIFT_RUN',r.id,coalesce(r.defect_recorded_at,r.started_at),r.operator_id,'مصرف تقریبی مواد بر اساس وزن محصول و کانتر تولید');
      end if;
      if v_scrap is not null and v_scrap_kg>0 and not exists(select 1 from material_transactions where reference_type='SHIFT_RUN' and reference_id=r.id and transaction_type='PRODUCTION_SCRAP') then
        insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
        values(v_scrap,'PRODUCTION_SCRAP',v_scrap_kg,'SHIFT_RUN',r.id,coalesce(r.defect_recorded_at,r.started_at),r.operator_id,'ضایعات تولید بر اساس تعداد معیوب × وزن سبد');
      end if;
    end if;
  else v_prod:=r.production_record_id; end if;

  update shift_runs set gross_quantity=r.gross_quantity,good_quantity=v_good,production_record_id=v_prod,finalized_at=now(),status='FINALIZED',updated_at=now()
  where id=r.id returning * into r;
  return to_jsonb(r);
end; $$;

-- Financial traceability triggers. Accrual/revenue and cash movement are intentionally separated.
create or replace function boostan_finance_payment_trigger() returns trigger language plpgsql as $$
begin
  if new.amount>0 and not exists(select 1 from financial_entries where source_type='PAYMENT' and source_id=new.id and entry_kind='CUSTOMER_RECEIPT') then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('CUSTOMER_RECEIPT','IN',new.amount,true,'PAYMENT',new.id,new.paid_at,new.operator_id,coalesce(new.note,'وصول از مشتری'));
  end if; return new;
end; $$;

drop trigger if exists trg_boostan_finance_payment on payments;
create trigger trg_boostan_finance_payment after insert on payments for each row execute function boostan_finance_payment_trigger();

create or replace function boostan_finance_sale_trigger() returns trigger language plpgsql as $$
begin
  if new.total_amount>0 and not exists(select 1 from financial_entries where source_type='SALE' and source_id=new.id and entry_kind='SALE_REVENUE') then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('SALE_REVENUE','IN',new.total_amount,false,'SALE',new.id,new.sold_at,new.entered_by,'فروش ثبت‌شده');
  end if;
  if new.customer_id is null and new.payment_amount>0 and not exists(select 1 from financial_entries where source_type='SALE' and source_id=new.id and entry_kind='CUSTOMER_RECEIPT') then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('CUSTOMER_RECEIPT','IN',new.payment_amount,true,'SALE',new.id,new.sold_at,new.entered_by,'دریافت همزمان فروش نقدی/کارت');
  end if; return new;
end; $$;
drop trigger if exists trg_boostan_finance_sale on sales;
create trigger trg_boostan_finance_sale after insert on sales for each row execute function boostan_finance_sale_trigger();

create or replace function boostan_finance_purchase_trigger() returns trigger language plpgsql as $$
begin
  if new.total_amount>0 and not exists(select 1 from financial_entries where source_type='PURCHASE' and source_id=new.id) then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('PURCHASE_COST','OUT',new.total_amount,true,'PURCHASE',new.id,new.purchased_at,new.created_by,'خرید: '||new.item_name);
  end if; return new;
end; $$;
drop trigger if exists trg_boostan_finance_purchase on purchases;
create trigger trg_boostan_finance_purchase after insert on purchases for each row execute function boostan_finance_purchase_trigger();

create or replace function boostan_finance_expense_trigger() returns trigger language plpgsql as $$
begin
  if new.amount>0 and not exists(select 1 from financial_entries where source_type='EXPENSE' and source_id=new.id) then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('FACTORY_EXPENSE','OUT',new.amount,true,'EXPENSE',new.id,new.expense_date,new.created_by,new.title);
  end if; return new;
end; $$;
drop trigger if exists trg_boostan_finance_expense on expenses;
create trigger trg_boostan_finance_expense after insert on expenses for each row execute function boostan_finance_expense_trigger();

create or replace function boostan_finance_grinding_trigger() returns trigger language plpgsql as $$
begin
  if new.labor_cost>0 and not exists(select 1 from financial_entries where source_type='GRINDING' and source_id=new.id) then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('GRINDING_COST','OUT',new.labor_cost,true,'GRINDING',new.id,new.ground_at,new.created_by,'هزینه آسیاب');
  end if; return new;
end; $$;
drop trigger if exists trg_boostan_finance_grinding on grinding_records;
create trigger trg_boostan_finance_grinding after insert on grinding_records for each row execute function boostan_finance_grinding_trigger();

create or replace function boostan_finance_return_trigger() returns trigger language plpgsql as $$
begin
  if new.amount_reduction>0 and not exists(select 1 from financial_entries where source_type='SALE_RETURN' and source_id=new.id and entry_kind='SALE_RETURN') then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('SALE_RETURN','OUT',new.amount_reduction,false,'SALE_RETURN',new.id,new.returned_at,new.created_by,'کاهش فروش بابت مرجوعی/ابطال: '||new.reason);
  end if;
  if new.refund_amount>0 and not exists(select 1 from financial_entries where source_type='SALE_RETURN' and source_id=new.id and entry_kind='REFUND') then
    insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
    values('REFUND','OUT',new.refund_amount,true,'SALE_RETURN',new.id,new.returned_at,new.created_by,'استرداد وجه: '||new.reason);
  end if; return new;
end; $$;
drop trigger if exists trg_boostan_finance_return on sale_returns;
create trigger trg_boostan_finance_return after insert or update of amount_reduction,refund_amount on sale_returns for each row execute function boostan_finance_return_trigger();

insert into factory_settings(key,value) values
('shift_start_grace_minutes','15'),
('material_tracking_mode','WEIGHT_ESTIMATE'),
('cloud_schema_version','2026-09-19-v2.2')
on conflict (key) do update set value=excluded.value;

alter table material_items enable row level security;
alter table material_transactions enable row level security;
alter table financial_entries enable row level security;
revoke all on material_items,material_transactions,financial_entries from anon,authenticated;
grant all on material_items,material_transactions,financial_entries to service_role;
grant execute on function boostan_set_material_actual(uuid,numeric,uuid,text) to service_role;
grant execute on function boostan_create_purchase(jsonb,uuid) to service_role;
grant execute on function boostan_create_grinding(jsonb,uuid) to service_role;

commit;
