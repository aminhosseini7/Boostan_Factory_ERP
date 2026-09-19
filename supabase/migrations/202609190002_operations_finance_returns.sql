-- Boostan Factory ERP v2.1 - operational workflows, finance and returns
-- Non-destructive upgrade for the deployed cloud database.
-- Corrected view column order: CREATE OR REPLACE VIEW requires existing columns to retain their names and order.
begin;

alter table products add column if not exists weight_kg numeric(12,4) not null default 0 check (weight_kg >= 0);

alter table sales alter column customer_id drop not null;
alter table sales add column if not exists driver_name varchar(150);
alter table sales add column if not exists driver_phone varchar(50);
alter table sales add column if not exists driver_vehicle varchar(100);
alter table sales add column if not exists status varchar(20) not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED','PARTIALLY_RETURNED','RETURNED'));

alter table expenses add column if not exists category varchar(50) not null default 'OTHER';
alter table expenses add column if not exists cost_type varchar(20) not null default 'NORMAL' check (cost_type in ('NORMAL','HEAVY'));
alter table expenses add column if not exists allocation_months integer not null default 1 check (allocation_months >= 1 and allocation_months <= 120);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_type varchar(30) not null check (purchase_type in ('RAW_MATERIAL','FINISHED_PRODUCT','USED_SCRAP','OTHER')),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name varchar(200),
  item_name varchar(200) not null,
  product_id uuid references products(id) on delete set null,
  quantity numeric(18,3) not null check (quantity > 0),
  unit varchar(30) not null default 'کیلوگرم',
  unit_price numeric(18,2) not null check (unit_price >= 0),
  total_amount numeric(18,2) generated always as (quantity * unit_price) stored,
  purchased_at timestamptz not null default now(),
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_purchases_date on purchases(purchased_at desc);
create index if not exists idx_purchases_type on purchases(purchase_type,purchased_at desc);

create table if not exists grinding_records (
  id uuid primary key default gen_random_uuid(),
  defective_count numeric(18,3) not null default 0 check (defective_count >= 0),
  approx_weight_each numeric(12,4) not null default 0 check (approx_weight_each >= 0),
  total_weight numeric(18,3) generated always as (defective_count * approx_weight_each) stored,
  labor_cost numeric(18,2) not null default 0 check (labor_cost >= 0),
  ground_at timestamptz not null default now(),
  note text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_grinding_date on grinding_records(ground_at desc);

create table if not exists sale_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  return_type varchar(20) not null check (return_type in ('RETURN','CANCEL')),
  amount_reduction numeric(18,2) not null default 0 check (amount_reduction >= 0),
  refund_amount numeric(18,2) not null default 0 check (refund_amount >= 0),
  reason varchar(300) not null,
  note text,
  returned_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sale_returns_sale on sale_returns(sale_id,returned_at desc);

create table if not exists sale_return_items (
  id uuid primary key default gen_random_uuid(),
  sale_return_id uuid not null references sale_returns(id) on delete cascade,
  sale_item_id uuid not null references sale_items(id),
  product_id uuid not null references products(id),
  quantity numeric(18,3) not null check (quantity > 0),
  amount_reduction numeric(18,2) not null default 0 check (amount_reduction >= 0)
);
create index if not exists idx_return_items_sale_item on sale_return_items(sale_item_id);

-- Existing views are replaced so cash/card sales can be anonymous and returns affect receivables.
create or replace view v_sales_summary as
select s.id,s.customer_id,c.name as customer_name,s.operator_id,u.full_name as operator_name,
       s.entered_by,eu.full_name as entered_by_name,s.subtotal,s.discount_amount,s.total_amount,
       s.payment_type,s.payment_amount,s.note,s.sold_at,s.created_at,s.driver_name,s.driver_phone,
       s.driver_vehicle,s.status,
       coalesce((select sum(sr.amount_reduction) from sale_returns sr where sr.sale_id=s.id),0)::numeric as returned_amount,
       (s.total_amount-coalesce((select sum(sr.amount_reduction) from sale_returns sr where sr.sale_id=s.id),0))::numeric as net_total
from sales s
left join customers c on c.id=s.customer_id
join users u on u.id=s.operator_id
join users eu on eu.id=s.entered_by;

create or replace view v_production_summary as
select pr.id,pr.product_id,p.name as product_name,pr.operator_id,u.full_name as operator_name,
       pr.quantity,pr.gross_quantity,pr.defects,pr.shift,pr.production_at,pr.note,pr.shift_run_id,
       p.weight_kg
from production_records pr
join products p on p.id=pr.product_id
join users u on u.id=pr.operator_id;

create or replace view v_customer_balances as
select c.id as customer_id,c.name,c.phone,
       coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)::numeric as sales_total,
       coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0)::numeric as payments_total,
       (
         coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)
         - coalesce((select sum(sr.amount_reduction) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)
         - coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0)
         + coalesce((select sum(sr.refund_amount) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)
       )::numeric as balance,
       coalesce((select sum(sr.amount_reduction) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)::numeric as returns_total,
       coalesce((select sum(sr.refund_amount) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)::numeric as refunds_total
from customers c
where c.is_active=true;

create or replace function boostan_operator_for_shift_date(p_shift uuid,p_day date)
returns uuid language sql stable as $$
  select os.user_id
  from operator_shifts os
  join users u on u.id=os.user_id
  where os.shift_id=p_shift and os.is_active=true and u.is_active=true
    and os.valid_from<=p_day and (os.valid_to is null or os.valid_to>=p_day)
  order by os.valid_from desc,os.created_at desc
  limit 1;
$$;

-- Returns the operator's assigned shift if they register a start counter within +/- 15 minutes
-- of scheduled start. Manager keeps normal current-shift behavior.
create or replace function boostan_shift_for_start(p_actor uuid,p_at timestamptz)
returns uuid language plpgsql stable as $$
declare
  v_role text;
  v_local_date date := (p_at at time zone 'Asia/Tehran')::date;
  v_minutes integer := extract(hour from (p_at at time zone 'Asia/Tehran')::time)::integer*60 + extract(minute from (p_at at time zone 'Asia/Tehran')::time)::integer;
  v_id uuid;
  v_grace integer := 15;
begin
  select role into v_role from users where id=p_actor and is_active=true;
  select coalesce(value::integer,15) into v_grace from factory_settings where key='shift_start_grace_minutes';
  if v_role='MANAGER' then
    select s.id into v_id from shifts s where s.is_active=true and least(abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer)),1440-abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer)))<=v_grace order by least(abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer)),1440-abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer))) limit 1;
    if v_id is not null then return v_id; end if;
    return boostan_shift_for_time(p_at);
  end if;
  select s.id into v_id
  from shifts s
  join operator_shifts os on os.shift_id=s.id and os.user_id=p_actor and os.is_active=true
  where s.is_active=true
    and os.valid_from<=v_local_date and (os.valid_to is null or os.valid_to>=v_local_date)
    and least(
      abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer)),
      1440-abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer))
    )<=v_grace
  order by least(
      abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer)),
      1440-abs(v_minutes-(extract(hour from s.start_time)::integer*60+extract(minute from s.start_time)::integer))
    )
  limit 1;
  return v_id;
end;
$$;

create or replace function boostan_start_shift(
  p_actor uuid,
  p_product uuid,
  p_counter numeric,
  p_at timestamptz default now(),
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_shift uuid;
  v_expected uuid;
  v_role text;
  v_local_date date;
  v_local_time time;
  v_shift_start time;
  v_shift_date date;
  v_prev shift_runs%rowtype;
  v_new shift_runs%rowtype;
  v_prod_active boolean;
begin
  if p_counter < 0 then raise exception 'Counter must be zero or greater'; end if;
  select role into v_role from users where id=p_actor and is_active=true;
  if v_role is null then raise exception 'User is not active'; end if;
  select is_active into v_prod_active from products where id=p_product;
  if coalesce(v_prod_active,false)=false then raise exception 'Product is not active'; end if;

  v_shift := boostan_shift_for_start(p_actor,p_at);
  if v_shift is null then
    if v_role='OPERATOR' then raise exception 'Start counter is outside your allowed shift-start window';
    else raise exception 'No active shift for this time'; end if;
  end if;

  v_local_date := (p_at at time zone 'Asia/Tehran')::date;
  v_local_time := (p_at at time zone 'Asia/Tehran')::time;
  select start_time into v_shift_start from shifts where id=v_shift;
  if v_shift_start > time '12:00' and v_local_time < time '12:00' then v_shift_date := v_local_date-1; else v_shift_date := v_local_date; end if;
  -- Early registration for a daytime shift belongs to the upcoming local day.
  if v_shift_start <= time '12:00' and v_local_time > time '20:00' then v_shift_date := v_local_date+1; end if;

  v_expected := boostan_operator_for_shift_date(v_shift,v_shift_date);
  if v_expected is null then raise exception 'No operator assigned to this shift'; end if;
  if v_role='OPERATOR' and v_expected<>p_actor then raise exception 'This is not your assigned shift'; end if;

  if exists(select 1 from shift_runs where shift_id=v_shift and shift_date=v_shift_date) then
    raise exception 'Start counter for this shift has already been registered';
  end if;

  select * into v_prev from shift_runs where status<>'FINALIZED' and end_counter is null order by started_at desc limit 1 for update;
  if found then
    if p_counter < v_prev.start_counter then raise exception 'Counter cannot go backwards'; end if;
    update shift_runs set end_counter=p_counter,gross_quantity=p_counter-v_prev.start_counter,
      status=case when defects is null then 'AWAITING_DEFECTS' else status end,updated_at=now()
    where id=v_prev.id returning * into v_prev;
    if v_prev.defects is not null then perform boostan_finalize_shift_run(v_prev.id); end if;
  end if;

  insert into shift_runs(shift_id,operator_id,product_id,shift_date,start_counter,started_at,status,note)
  values(v_shift,v_expected,p_product,v_shift_date,p_counter,p_at,'ACTIVE',nullif(p_note,'')) returning * into v_new;
  perform boostan_log(p_actor,'START_SHIFT','SHIFT_RUN',v_new.id,jsonb_build_object('counter',p_counter,'productId',p_product));
  return to_jsonb(v_new);
end;
$$;

create or replace function boostan_create_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_customer uuid := nullif(p_payload->>'customerId','')::uuid;
  v_sold_at timestamptz := now();
  v_payment_type text := upper(coalesce(p_payload->>'paymentType','CASH'));
  v_payment_method text := nullif(p_payload->>'paymentMethod','');
  v_note text := nullif(p_payload->>'note','');
  v_discount numeric := coalesce(nullif(p_payload->>'discountAmount','')::numeric,0);
  v_actor_role text;
  v_operator uuid;
  v_subtotal numeric := 0;
  v_total numeric;
  v_paid numeric := 0;
  v_sale uuid;
  item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_stock numeric;
  v_line numeric;
  v_lines jsonb := '[]'::jsonb;
  v_seen uuid[] := array[]::uuid[];
begin
  select role into v_actor_role from users where id=p_actor and is_active=true;
  if v_actor_role is null then raise exception 'User is not active'; end if;
  if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or coalesce(jsonb_array_length(p_payload->'items'),0)<1 then raise exception 'At least one sale item is required'; end if;

  -- Shift attribution is automatic. Manager can still be the actual data-entry/seller via entered_by.
  v_operator := boostan_operator_for_time(v_sold_at);
  if v_operator is null then raise exception 'No operator assigned for sale time'; end if;
  if v_actor_role='OPERATOR' and v_operator<>p_actor then raise exception 'Sale time does not belong to your shift'; end if;

  if v_payment_type in ('CREDIT','MIXED') then
    if v_customer is null then raise exception 'Credit customer is required'; end if;
    if not exists(select 1 from customers where id=v_customer and is_active=true) then raise exception 'Customer is not available'; end if;
  elsif v_payment_type not in ('CASH','CARD') then
    raise exception 'Invalid payment type';
  end if;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    v_pid := (item->>'productId')::uuid;
    v_qty := (item->>'quantity')::numeric;
    if v_qty<=0 then raise exception 'Sale quantity must be positive'; end if;
    if v_pid=any(v_seen) then raise exception 'Duplicate product in sale items'; end if;
    v_seen := array_append(v_seen,v_pid);
    perform pg_advisory_xact_lock(hashtext(v_pid::text));
    if not exists(select 1 from products where id=v_pid and is_active=true) then raise exception 'Product is not available'; end if;
    select pp.price into v_price from product_prices pp where pp.product_id=v_pid and pp.valid_from<=v_sold_at order by pp.valid_from desc limit 1;
    if v_price is null then select price into v_price from products where id=v_pid; end if;
    select coalesce(sum(case when transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then quantity when transaction_type in ('SALE','ADJUSTMENT_OUT') then -quantity else 0 end),0)
      into v_stock from inventory_transactions where product_id=v_pid;
    if v_stock<v_qty then raise exception 'Insufficient stock'; end if;
    v_line:=v_qty*v_price; v_subtotal:=v_subtotal+v_line;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_pid,'quantity',v_qty,'unitPrice',v_price,'lineTotal',v_line));
  end loop;

  if v_discount<0 or v_discount>v_subtotal then raise exception 'Invalid discount'; end if;
  v_total:=v_subtotal-v_discount;
  if v_payment_type in ('CASH','CARD') then
    v_paid:=v_total;
  else
    v_paid:=coalesce(nullif(p_payload->>'paymentAmount','')::numeric,0);
    if v_paid<0 or v_paid>=v_total then raise exception 'Credit prepayment must be zero or less than total'; end if;
  end if;

  insert into sales(customer_id,operator_id,entered_by,subtotal,discount_amount,total_amount,payment_type,payment_amount,note,sold_at,
                    driver_name,driver_phone,driver_vehicle)
  values(v_customer,v_operator,p_actor,v_subtotal,v_discount,v_total,v_payment_type,v_paid,v_note,v_sold_at,
         nullif(p_payload->>'driverName',''),nullif(p_payload->>'driverPhone',''),nullif(p_payload->>'driverVehicle',''))
  returning id into v_sale;

  for item in select value from jsonb_array_elements(v_lines) loop
    insert into sale_items(sale_id,product_id,quantity,unit_price)
    values(v_sale,(item->>'productId')::uuid,(item->>'quantity')::numeric,(item->>'unitPrice')::numeric);
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values((item->>'productId')::uuid,'SALE',(item->>'quantity')::numeric,'SALE',v_sale,v_operator,v_sold_at,v_note);
  end loop;

  if v_paid>0 and v_customer is not null then
    insert into payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
    values(v_customer,v_sale,v_paid,coalesce(v_payment_method,'OTHER'),p_actor,v_sold_at,'پیش پرداخت ثبت‌شده همزمان با فروش');
  end if;
  perform boostan_log(p_actor,'CREATE_SALE','SALE',v_sale,jsonb_build_object('operatorId',v_operator,'total',v_total,'discount',v_discount));
  return jsonb_build_object('id',v_sale,'customerId',v_customer,'operatorId',v_operator,'enteredBy',p_actor,'subtotal',v_subtotal,'discountAmount',v_discount,'totalAmount',v_total,'paymentType',v_payment_type,'paymentAmount',v_paid,'soldAt',v_sold_at,'items',v_lines,'balanceDue',v_total-v_paid);
end;
$$;

create or replace function boostan_set_inventory_actual(p_product uuid,p_actual numeric,p_actor uuid,p_note text)
returns jsonb language plpgsql as $$
declare
  v_stock numeric;
  v_delta numeric;
  v_type text;
  v_id uuid;
begin
  if p_actual<0 then raise exception 'Actual stock cannot be negative'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Reason is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_product::text));
  select coalesce(sum(case when transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then quantity when transaction_type in ('SALE','ADJUSTMENT_OUT') then -quantity else 0 end),0)
    into v_stock from inventory_transactions where product_id=p_product;
  v_delta:=p_actual-v_stock;
  if v_delta=0 then return jsonb_build_object('productId',p_product,'previousStock',v_stock,'actualStock',p_actual,'difference',0); end if;
  v_type:=case when v_delta>0 then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end;
  insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,operator_id,occurred_at,note)
  values(p_product,v_type,abs(v_delta),'STOCKTAKE',p_actor,now(),p_note) returning id into v_id;
  perform boostan_log(p_actor,'SET_ACTUAL_STOCK','INVENTORY',v_id,jsonb_build_object('productId',p_product,'previousStock',v_stock,'actualStock',p_actual,'difference',v_delta));
  return jsonb_build_object('id',v_id,'productId',p_product,'previousStock',v_stock,'actualStock',p_actual,'difference',v_delta,'transactionType',v_type);
end;
$$;

create or replace function boostan_create_purchase(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_id uuid;
  v_product uuid:=nullif(p_payload->>'productId','')::uuid;
  v_type text:=upper(coalesce(p_payload->>'purchaseType','OTHER'));
  v_qty numeric:=coalesce(nullif(p_payload->>'quantity','')::numeric,0);
  v_price numeric:=coalesce(nullif(p_payload->>'unitPrice','')::numeric,0);
  v_name text:=trim(coalesce(p_payload->>'itemName',''));
begin
  if v_type not in ('RAW_MATERIAL','FINISHED_PRODUCT','USED_SCRAP','OTHER') then raise exception 'Invalid purchase type'; end if;
  if v_qty<=0 or v_price<0 or v_name='' then raise exception 'Purchase data is invalid'; end if;
  if v_type='FINISHED_PRODUCT' and v_product is null then raise exception 'Finished product purchase must select a product'; end if;
  insert into purchases(purchase_type,supplier_name,item_name,product_id,quantity,unit,unit_price,purchased_at,note,created_by)
  values(v_type,nullif(p_payload->>'supplierName',''),v_name,v_product,v_qty,coalesce(nullif(p_payload->>'unit',''),'کیلوگرم'),v_price,now(),nullif(p_payload->>'note',''),p_actor)
  returning id into v_id;
  if v_type='FINISHED_PRODUCT' and v_product is not null then
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values(v_product,'ADJUSTMENT_IN',v_qty,'PURCHASE',v_id,p_actor,now(),'خرید سبد/محصول آماده');
  end if;
  perform boostan_log(p_actor,'CREATE_PURCHASE','PURCHASE',v_id,jsonb_build_object('purchaseType',v_type,'quantity',v_qty,'unitPrice',v_price));
  return jsonb_build_object('id',v_id,'purchaseType',v_type,'quantity',v_qty,'unitPrice',v_price,'totalAmount',v_qty*v_price);
end;
$$;

create or replace function boostan_return_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_sale sales%rowtype;
  v_return_id uuid;
  v_type text:=upper(coalesce(p_payload->>'returnType','RETURN'));
  v_refund numeric:=coalesce(nullif(p_payload->>'refundAmount','')::numeric,0);
  v_reduction numeric:=0;
  v_reason text:=trim(coalesce(p_payload->>'reason',''));
  item jsonb;
  si sale_items%rowtype;
  v_prev_qty numeric;
  v_qty numeric;
  v_item_reduction numeric;
  v_factor numeric;
begin
  if v_type not in ('RETURN','CANCEL') then raise exception 'Invalid return type'; end if;
  if v_reason='' then raise exception 'Return reason is required'; end if;
  select * into v_sale from sales where id=(p_payload->>'saleId')::uuid for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.status='CANCELLED' then raise exception 'Sale is already cancelled'; end if;
  v_factor:=case when v_sale.subtotal>0 then v_sale.total_amount/v_sale.subtotal else 1 end;

  insert into sale_returns(sale_id,return_type,amount_reduction,refund_amount,reason,note,returned_at,created_by)
  values(v_sale.id,v_type,0,v_refund,v_reason,nullif(p_payload->>'note',''),now(),p_actor) returning id into v_return_id;

  if v_type='CANCEL' then
    for si in select * from sale_items where sale_id=v_sale.id loop
      select coalesce(sum(sri.quantity),0) into v_prev_qty from sale_return_items sri where sri.sale_item_id=si.id;
      v_qty:=si.quantity-v_prev_qty;
      if v_qty>0 then
        v_item_reduction:=round(v_qty*si.unit_price*v_factor,2);
        insert into sale_return_items(sale_return_id,sale_item_id,product_id,quantity,amount_reduction) values(v_return_id,si.id,si.product_id,v_qty,v_item_reduction);
        insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
        values(si.product_id,'SALE_RETURN',v_qty,'SALE_RETURN',v_return_id,p_actor,now(),v_reason);
        v_reduction:=v_reduction+v_item_reduction;
      end if;
    end loop;
  else
    if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or jsonb_array_length(p_payload->'items')<1 then raise exception 'Returned items are required'; end if;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      select * into si from sale_items where id=(item->>'saleItemId')::uuid and sale_id=v_sale.id;
      if not found then raise exception 'Sale item not found'; end if;
      v_qty:=(item->>'quantity')::numeric;
      select coalesce(sum(sri.quantity),0) into v_prev_qty from sale_return_items sri where sri.sale_item_id=si.id;
      if v_qty<=0 or v_prev_qty+v_qty>si.quantity then raise exception 'Returned quantity exceeds sold quantity'; end if;
      v_item_reduction:=round(v_qty*si.unit_price*v_factor,2);
      insert into sale_return_items(sale_return_id,sale_item_id,product_id,quantity,amount_reduction) values(v_return_id,si.id,si.product_id,v_qty,v_item_reduction);
      insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
      values(si.product_id,'SALE_RETURN',v_qty,'SALE_RETURN',v_return_id,p_actor,now(),v_reason);
      v_reduction:=v_reduction+v_item_reduction;
    end loop;
  end if;

  if v_refund<0 or v_refund>v_reduction then raise exception 'Refund cannot exceed returned sale value'; end if;
  update sale_returns set amount_reduction=v_reduction where id=v_return_id;
  update sales set status=case
    when v_type='CANCEL' then 'CANCELLED'
    when coalesce((select sum(sr.amount_reduction) from sale_returns sr where sr.sale_id=v_sale.id),0)>=v_sale.total_amount-0.01 then 'RETURNED'
    else 'PARTIALLY_RETURNED' end
  where id=v_sale.id;
  perform boostan_log(p_actor,case when v_type='CANCEL' then 'CANCEL_SALE' else 'RETURN_SALE' end,'SALE',v_sale.id,jsonb_build_object('returnId',v_return_id,'amountReduction',v_reduction,'refundAmount',v_refund));
  return jsonb_build_object('id',v_return_id,'saleId',v_sale.id,'returnType',v_type,'amountReduction',v_reduction,'refundAmount',v_refund,'returnedAt',now());
end;
$$;

insert into factory_settings(key,value) values('shift_start_grace_minutes','15') on conflict(key) do update set value=excluded.value,updated_at=now();
insert into factory_settings(key,value) values('cloud_schema_version','2026-09-19-v2.1') on conflict(key) do update set value=excluded.value,updated_at=now();

alter table purchases enable row level security;
alter table grinding_records enable row level security;
alter table sale_returns enable row level security;
alter table sale_return_items enable row level security;
revoke all on purchases,grinding_records,sale_returns,sale_return_items from anon,authenticated;
grant all on purchases,grinding_records,sale_returns,sale_return_items to service_role;
grant execute on function boostan_operator_for_shift_date(uuid,date) to service_role;
grant execute on function boostan_shift_for_start(uuid,timestamptz) to service_role;
grant execute on function boostan_start_shift(uuid,uuid,numeric,timestamptz,text) to service_role;
grant execute on function boostan_create_sale(jsonb,uuid) to service_role;
grant execute on function boostan_set_inventory_actual(uuid,numeric,uuid,text) to service_role;
grant execute on function boostan_create_purchase(jsonb,uuid) to service_role;
grant execute on function boostan_return_sale(jsonb,uuid) to service_role;

commit;
