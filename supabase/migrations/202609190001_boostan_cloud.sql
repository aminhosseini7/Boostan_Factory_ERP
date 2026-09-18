-- Boostan Factory ERP - Cloud schema (Supabase)
-- WARNING: This migration resets the ERP tables. It is intended for the current test/pilot project.

begin;

create extension if not exists pgcrypto;

-- Remove old ERP objects so the cloud schema is deterministic.
drop view if exists v_shift_runs cascade;
drop view if exists v_production_summary cascade;
drop view if exists v_sales_summary cascade;
drop view if exists v_customer_balances cascade;
drop view if exists v_inventory_stock cascade;

drop table if exists activity_logs cascade;
drop table if exists inventory_transactions cascade;
drop table if exists payments cascade;
drop table if exists sale_items cascade;
drop table if exists sales cascade;
drop table if exists production_records cascade;
drop table if exists shift_runs cascade;
drop table if exists operator_shifts cascade;
drop table if exists shifts cascade;
drop table if exists operators cascade;
drop table if exists product_prices cascade;
drop table if exists expenses cascade;
drop table if exists suppliers cascade;
drop table if exists factory_settings cascade;
drop table if exists customers cascade;
drop table if exists products cascade;
drop table if exists users cascade;

create table users (
  id uuid primary key default gen_random_uuid(),
  username varchar(80) unique not null,
  full_name varchar(150) not null,
  password_hash text not null,
  role varchar(20) not null check (role in ('MANAGER','OPERATOR')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code varchar(100) unique,
  name varchar(200) not null,
  unit varchar(50) not null default 'عدد',
  price numeric(18,2) not null default 0 check (price >= 0),
  minimum_stock numeric(18,3) not null default 0 check (minimum_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric(18,2) not null check (price >= 0),
  valid_from timestamptz not null default now(),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index idx_product_prices_effective on product_prices(product_id, valid_from desc);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  phone varchar(50),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) unique not null check (code in ('NIGHT','MORNING','EVENING')),
  name varchar(50) not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true
);

create table operator_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  valid_from date not null default current_date,
  valid_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index idx_operator_shifts_lookup on operator_shifts(shift_id, is_active, valid_from, valid_to);

create table shift_runs (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references shifts(id),
  operator_id uuid not null references users(id),
  product_id uuid not null references products(id),
  shift_date date not null,
  start_counter numeric(18,0) not null check (start_counter >= 0),
  end_counter numeric(18,0),
  defects numeric(18,0),
  gross_quantity numeric(18,0),
  good_quantity numeric(18,0),
  started_at timestamptz not null,
  defect_recorded_at timestamptz,
  finalized_at timestamptz,
  status varchar(30) not null default 'ACTIVE' check (status in ('ACTIVE','AWAITING_NEXT_COUNTER','AWAITING_DEFECTS','FINALIZED')),
  note text,
  production_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, shift_date)
);
create index idx_shift_runs_open on shift_runs(status, started_at desc);
create index idx_shift_runs_operator on shift_runs(operator_id, started_at desc);

create table production_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  operator_id uuid not null references users(id),
  shift_run_id uuid unique references shift_runs(id) on delete set null,
  quantity numeric(18,3) not null check (quantity >= 0),
  gross_quantity numeric(18,3) not null default 0 check (gross_quantity >= 0),
  defects numeric(18,3) not null default 0 check (defects >= 0),
  shift varchar(20) not null check (shift in ('MORNING','EVENING','NIGHT')),
  production_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  operator_id uuid not null references users(id),
  entered_by uuid not null references users(id),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(18,2) not null check (total_amount >= 0),
  payment_type varchar(20) not null check (payment_type in ('CASH','CARD','CREDIT','MIXED')),
  payment_amount numeric(18,2) not null default 0 check (payment_amount >= 0),
  note text,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(18,3) not null check (quantity > 0),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) generated always as (quantity * unit_price) stored
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  sale_id uuid references sales(id) on delete set null,
  amount numeric(18,2) not null check (amount > 0),
  payment_method varchar(50) not null,
  operator_id uuid references users(id),
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  transaction_type varchar(30) not null check (transaction_type in ('OPENING','PRODUCTION','SALE','SALE_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  quantity numeric(18,3) not null check (quantity > 0),
  reference_type varchar(50),
  reference_id uuid,
  operator_id uuid references users(id),
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action varchar(100) not null,
  entity_type varchar(50),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name varchar(200) not null,
  phone varchar(50),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  title varchar(200) not null,
  amount numeric(18,2) not null check (amount >= 0),
  expense_date timestamptz not null default now(),
  note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table factory_settings (
  key varchar(100) primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index idx_products_name on products(name);
create index idx_customers_name on customers(name);
create index idx_production_product_date on production_records(product_id, production_at desc);
create index idx_production_operator_date on production_records(operator_id, production_at desc);
create index idx_sales_customer_date on sales(customer_id, sold_at desc);
create index idx_sales_operator_date on sales(operator_id, sold_at desc);
create index idx_sale_items_sale on sale_items(sale_id);
create index idx_inventory_product_date on inventory_transactions(product_id, occurred_at desc);
create index idx_payments_customer_date on payments(customer_id, paid_at desc);
create index idx_activity_created on activity_logs(created_at desc);

create or replace view v_inventory_stock as
select p.id as product_id,p.code,p.name,p.unit,p.price,p.minimum_stock,
       coalesce(sum(case
         when it.transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then it.quantity
         when it.transaction_type in ('SALE','ADJUSTMENT_OUT') then -it.quantity
         else 0 end),0)::numeric as stock
from products p
left join inventory_transactions it on it.product_id=p.id
where p.is_active=true
group by p.id,p.code,p.name,p.unit,p.price,p.minimum_stock;

create or replace view v_customer_balances as
select c.id as customer_id,c.name,c.phone,
       coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)::numeric as sales_total,
       coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0)::numeric as payments_total,
       (coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)-
        coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0))::numeric as balance
from customers c
where c.is_active=true;

create or replace view v_sales_summary as
select s.id,s.customer_id,c.name as customer_name,s.operator_id,u.full_name as operator_name,
       s.entered_by,eu.full_name as entered_by_name,s.subtotal,s.discount_amount,s.total_amount,
       s.payment_type,s.payment_amount,s.note,s.sold_at,s.created_at
from sales s
join customers c on c.id=s.customer_id
join users u on u.id=s.operator_id
join users eu on eu.id=s.entered_by;

create or replace view v_production_summary as
select pr.id,pr.product_id,p.name as product_name,pr.operator_id,u.full_name as operator_name,
       pr.quantity,pr.gross_quantity,pr.defects,pr.shift,pr.production_at,pr.note,pr.shift_run_id
from production_records pr
join products p on p.id=pr.product_id
join users u on u.id=pr.operator_id;

create or replace view v_shift_runs as
select sr.id,sr.shift_id,s.code as shift_code,s.name as shift_name,sr.operator_id,u.full_name as operator_name,
       sr.product_id,p.name as product_name,sr.shift_date,sr.start_counter,sr.end_counter,sr.defects,
       sr.gross_quantity,sr.good_quantity,sr.started_at,sr.defect_recorded_at,sr.finalized_at,sr.status,sr.note
from shift_runs sr
join shifts s on s.id=sr.shift_id
join users u on u.id=sr.operator_id
join products p on p.id=sr.product_id;

-- Find the active shift using Iran local factory time.
create or replace function boostan_shift_for_time(p_at timestamptz)
returns uuid language plpgsql stable as $$
declare
  v_time time;
  v_id uuid;
begin
  v_time := (p_at at time zone 'Asia/Tehran')::time;
  select id into v_id
  from shifts
  where is_active=true and (
    (start_time < end_time and v_time >= start_time and v_time < end_time)
    or
    (start_time > end_time and (v_time >= start_time or v_time < end_time))
  )
  order by start_time
  limit 1;
  return v_id;
end;
$$;

create or replace function boostan_operator_for_time(p_at timestamptz)
returns uuid language plpgsql stable as $$
declare
  v_shift uuid;
  v_day date;
  v_user uuid;
begin
  v_shift := boostan_shift_for_time(p_at);
  v_day := (p_at at time zone 'Asia/Tehran')::date;
  select os.user_id into v_user
  from operator_shifts os
  join users u on u.id=os.user_id
  where os.shift_id=v_shift and os.is_active=true and u.is_active=true
    and os.valid_from <= v_day and (os.valid_to is null or os.valid_to >= v_day)
  order by os.valid_from desc, os.created_at desc
  limit 1;
  return v_user;
end;
$$;

create or replace function boostan_log(p_user uuid,p_action text,p_entity_type text,p_entity_id uuid,p_details jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into activity_logs(user_id,action,entity_type,entity_id,details)
  values(p_user,p_action,p_entity_type,p_entity_id,coalesce(p_details,'{}'::jsonb));
$$;

create or replace function boostan_finalize_shift_run(p_run_id uuid)
returns jsonb language plpgsql as $$
declare
  r shift_runs%rowtype;
  v_shift_code text;
  v_prod uuid;
  v_good numeric;
begin
  select * into r from shift_runs where id=p_run_id for update;
  if not found then raise exception 'Shift run not found'; end if;
  if r.status='FINALIZED' then
    return to_jsonb(r);
  end if;
  if r.end_counter is null or r.defects is null then
    return to_jsonb(r);
  end if;
  if r.end_counter < r.start_counter then
    raise exception 'Counter cannot go backwards';
  end if;
  r.gross_quantity := r.end_counter-r.start_counter;
  if r.defects < 0 or r.defects > r.gross_quantity then
    raise exception 'Defective count is invalid';
  end if;
  v_good := r.gross_quantity-r.defects;
  select code into v_shift_code from shifts where id=r.shift_id;

  if r.production_record_id is null then
    insert into production_records(product_id,operator_id,shift_run_id,quantity,gross_quantity,defects,shift,production_at,note)
    values(r.product_id,r.operator_id,r.id,v_good,r.gross_quantity,r.defects,v_shift_code,coalesce(r.defect_recorded_at,r.started_at),r.note)
    returning id into v_prod;

    if v_good > 0 then
      insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
      values(r.product_id,'PRODUCTION',v_good,'SHIFT_RUN',r.id,r.operator_id,coalesce(r.defect_recorded_at,r.started_at),r.note);
    end if;
  else
    v_prod := r.production_record_id;
  end if;

  update shift_runs set gross_quantity=r.gross_quantity,good_quantity=v_good,production_record_id=v_prod,
    finalized_at=now(),status='FINALIZED',updated_at=now()
  where id=r.id
  returning * into r;
  return to_jsonb(r);
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

  v_shift := boostan_shift_for_time(p_at);
  if v_shift is null then raise exception 'No active shift for this time'; end if;
  v_expected := boostan_operator_for_time(p_at);
  if v_expected is null then raise exception 'No operator assigned to this shift'; end if;
  if v_role='OPERATOR' and v_expected<>p_actor then raise exception 'This is not your assigned shift'; end if;

  v_local_date := (p_at at time zone 'Asia/Tehran')::date;
  v_local_time := (p_at at time zone 'Asia/Tehran')::time;
  select start_time into v_shift_start from shifts where id=v_shift;
  if v_shift_start > time '12:00' and v_local_time < time '12:00' then
    v_shift_date := v_local_date-1;
  else
    v_shift_date := v_local_date;
  end if;

  if exists(select 1 from shift_runs where shift_id=v_shift and shift_date=v_shift_date) then
    raise exception 'Start counter for this shift has already been registered';
  end if;

  -- The new start counter is the previous run's end counter.
  select * into v_prev
  from shift_runs
  where status<>'FINALIZED' and end_counter is null
  order by started_at desc
  limit 1
  for update;

  if found then
    if p_counter < v_prev.start_counter then raise exception 'Counter cannot go backwards'; end if;
    update shift_runs set end_counter=p_counter,gross_quantity=p_counter-v_prev.start_counter,
      status=case when defects is null then 'AWAITING_DEFECTS' else status end,
      updated_at=now()
    where id=v_prev.id
    returning * into v_prev;
    if v_prev.defects is not null then
      perform boostan_finalize_shift_run(v_prev.id);
    end if;
  end if;

  insert into shift_runs(shift_id,operator_id,product_id,shift_date,start_counter,started_at,status,note)
  values(v_shift,v_expected,p_product,v_shift_date,p_counter,p_at,'ACTIVE',nullif(p_note,''))
  returning * into v_new;

  perform boostan_log(p_actor,'START_SHIFT','SHIFT_RUN',v_new.id,jsonb_build_object('counter',p_counter,'productId',p_product));
  return to_jsonb(v_new);
end;
$$;

create or replace function boostan_end_shift(
  p_actor uuid,
  p_defects numeric,
  p_at timestamptz default now(),
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_role text;
  r shift_runs%rowtype;
  outrow jsonb;
begin
  if p_defects < 0 then raise exception 'Defects must be zero or greater'; end if;
  select role into v_role from users where id=p_actor and is_active=true;
  if v_role is null then raise exception 'User is not active'; end if;

  if v_role='MANAGER' then
    select * into r from shift_runs where status<>'FINALIZED' order by started_at desc limit 1 for update;
  else
    select * into r from shift_runs where operator_id=p_actor and status<>'FINALIZED' order by started_at desc limit 1 for update;
  end if;
  if not found then raise exception 'No open shift run found'; end if;

  update shift_runs set defects=p_defects,defect_recorded_at=p_at,note=coalesce(nullif(p_note,''),note),
    status=case when end_counter is null then 'AWAITING_NEXT_COUNTER' else status end,updated_at=now()
  where id=r.id
  returning * into r;

  if r.end_counter is not null then
    outrow := boostan_finalize_shift_run(r.id);
  else
    outrow := to_jsonb(r);
  end if;
  perform boostan_log(p_actor,'END_SHIFT','SHIFT_RUN',r.id,jsonb_build_object('defects',p_defects));
  return outrow;
end;
$$;

create or replace function boostan_create_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_customer uuid := (p_payload->>'customerId')::uuid;
  v_sold_at timestamptz := coalesce((p_payload->>'soldAt')::timestamptz,now());
  v_payment_type text := upper(coalesce(p_payload->>'paymentType','CASH'));
  v_payment_method text := nullif(p_payload->>'paymentMethod','');
  v_note text := nullif(p_payload->>'note','');
  v_discount numeric := coalesce((p_payload->>'discountAmount')::numeric,0);
  v_actor_role text;
  v_operator uuid;
  v_subtotal numeric := 0;
  v_total numeric;
  v_paid numeric;
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
  if not exists(select 1 from customers where id=v_customer and is_active=true) then raise exception 'Customer is not available'; end if;
  if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or coalesce(jsonb_array_length(p_payload->'items'),0)<1 then raise exception 'At least one sale item is required'; end if;

  v_operator := boostan_operator_for_time(v_sold_at);
  if v_operator is null then raise exception 'No operator assigned for sale time'; end if;
  if v_actor_role='OPERATOR' and v_operator<>p_actor then raise exception 'Sale time does not belong to your shift'; end if;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    v_pid := (item->>'productId')::uuid;
    v_qty := (item->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Sale quantity must be positive'; end if;
    if v_pid = any(v_seen) then raise exception 'Duplicate product in sale items'; end if;
    v_seen := array_append(v_seen,v_pid);
    perform pg_advisory_xact_lock(hashtext(v_pid::text));
    if not exists(select 1 from products where id=v_pid and is_active=true) then raise exception 'Product is not available'; end if;
    select pp.price into v_price from product_prices pp where pp.product_id=v_pid and pp.valid_from<=v_sold_at order by pp.valid_from desc limit 1;
    if v_price is null then select price into v_price from products where id=v_pid; end if;
    select coalesce(sum(case when transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then quantity when transaction_type in ('SALE','ADJUSTMENT_OUT') then -quantity else 0 end),0)
      into v_stock from inventory_transactions where product_id=v_pid;
    if v_stock < v_qty then raise exception 'Insufficient stock'; end if;
    v_line := v_qty*v_price;
    v_subtotal := v_subtotal+v_line;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('productId',v_pid,'quantity',v_qty,'unitPrice',v_price,'lineTotal',v_line));
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Invalid discount'; end if;
  v_total := v_subtotal-v_discount;
  if v_payment_type in ('CASH','CARD') then
    v_paid := v_total;
  elsif v_payment_type='CREDIT' then
    v_paid := 0;
  elsif v_payment_type='MIXED' then
    v_paid := coalesce((p_payload->>'paymentAmount')::numeric,0);
    if v_paid<=0 or v_paid>=v_total then raise exception 'Mixed payment must be between zero and total'; end if;
  else
    raise exception 'Invalid payment type';
  end if;

  insert into sales(customer_id,operator_id,entered_by,subtotal,discount_amount,total_amount,payment_type,payment_amount,note,sold_at)
  values(v_customer,v_operator,p_actor,v_subtotal,v_discount,v_total,v_payment_type,v_paid,v_note,v_sold_at)
  returning id into v_sale;

  for item in select value from jsonb_array_elements(v_lines) loop
    insert into sale_items(sale_id,product_id,quantity,unit_price)
    values(v_sale,(item->>'productId')::uuid,(item->>'quantity')::numeric,(item->>'unitPrice')::numeric);
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values((item->>'productId')::uuid,'SALE',(item->>'quantity')::numeric,'SALE',v_sale,v_operator,v_sold_at,v_note);
  end loop;

  if v_paid>0 then
    insert into payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
    values(v_customer,v_sale,v_paid,coalesce(v_payment_method,case when v_payment_type='MIXED' then 'OTHER' else v_payment_type end),p_actor,v_sold_at,'Payment recorded with sale');
  end if;

  perform boostan_log(p_actor,'CREATE_SALE','SALE',v_sale,jsonb_build_object('operatorId',v_operator,'total',v_total,'discount',v_discount));
  return jsonb_build_object('id',v_sale,'customerId',v_customer,'operatorId',v_operator,'subtotal',v_subtotal,'discountAmount',v_discount,'totalAmount',v_total,'paymentType',v_payment_type,'paymentAmount',v_paid,'soldAt',v_sold_at,'items',v_lines,'balanceDue',v_total-v_paid);
end;
$$;

create or replace function boostan_create_payment(p_customer uuid,p_amount numeric,p_method text,p_actor uuid,p_paid_at timestamptz default now(),p_note text default null)
returns jsonb language plpgsql as $$
declare
  v_balance numeric;
  v_id uuid;
begin
  select balance into v_balance from v_customer_balances where customer_id=p_customer;
  if v_balance is null then raise exception 'Customer not found'; end if;
  if p_amount<=0 then raise exception 'Payment must be positive'; end if;
  if p_amount>v_balance then raise exception 'Payment exceeds customer debt'; end if;
  insert into payments(customer_id,amount,payment_method,operator_id,paid_at,note)
  values(p_customer,p_amount,p_method,p_actor,p_paid_at,nullif(p_note,'')) returning id into v_id;
  perform boostan_log(p_actor,'CREATE_PAYMENT','PAYMENT',v_id,jsonb_build_object('customerId',p_customer,'amount',p_amount));
  return jsonb_build_object('id',v_id,'customerId',p_customer,'amount',p_amount,'paymentMethod',p_method,'paidAt',p_paid_at,'note',p_note);
end;
$$;

create or replace function boostan_adjust_inventory(p_product uuid,p_direction text,p_quantity numeric,p_actor uuid,p_at timestamptz default now(),p_note text default null)
returns jsonb language plpgsql as $$
declare
  v_stock numeric;
  v_type text;
  v_id uuid;
begin
  if p_quantity<=0 then raise exception 'Quantity must be positive'; end if;
  if upper(p_direction) not in ('IN','OUT') then raise exception 'Invalid inventory direction'; end if;
  perform pg_advisory_xact_lock(hashtext(p_product::text));
  if not exists(select 1 from products where id=p_product and is_active=true) then raise exception 'Product is not available'; end if;
  if upper(p_direction)='OUT' then
    select coalesce(sum(case when transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then quantity when transaction_type in ('SALE','ADJUSTMENT_OUT') then -quantity else 0 end),0)
      into v_stock from inventory_transactions where product_id=p_product;
    if v_stock<p_quantity then raise exception 'Insufficient stock'; end if;
    v_type:='ADJUSTMENT_OUT';
  else
    v_type:='ADJUSTMENT_IN';
  end if;
  insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,operator_id,occurred_at,note)
  values(p_product,v_type,p_quantity,'ADJUSTMENT',p_actor,p_at,nullif(p_note,'')) returning id into v_id;
  perform boostan_log(p_actor,'INVENTORY_ADJUSTMENT','INVENTORY',v_id,jsonb_build_object('productId',p_product,'direction',p_direction,'quantity',p_quantity));
  return jsonb_build_object('id',v_id,'productId',p_product,'transactionType',v_type,'quantity',p_quantity,'occurredAt',p_at,'note',p_note);
end;
$$;

-- Seed the real factory users. bcrypt hashes correspond to the passwords agreed for pilot use.
insert into users(username,full_name,password_hash,role) values
('manager','بهنام حسینی','$2a$10$/AHyPS6T.11qqOnP0eC/MeNOvoX7tLE/UM72EpVaBg.dt1BuiHLrq','MANAGER'),
('kamran','کامران قلی پور','$2a$10$vUmRy5cBgZg3PdGboC2bluOdhnTYIEJmQ/z7gLcG.30GRF/1UoaVS','OPERATOR'),
('hasan','حسن قلی پور','$2a$10$ln9ikZtieodEy0fdVV9bCu9EdWxzd8JOr1d.xlt0qBPIKNNjy/LeS','OPERATOR'),
('mohammad','محمد قاسمی','$2a$10$5ieS44yi1jQOuUFsDkPfoel5jxBAtUVvl0NEAkBfJc5BgTs1zcqR','OPERATOR');

insert into shifts(code,name,start_time,end_time) values
('NIGHT','شیفت شب','22:00','06:00'),
('MORNING','شیفت صبح','06:00','14:00'),
('EVENING','شیفت عصر','14:00','22:00');

insert into operator_shifts(user_id,shift_id,valid_from)
select u.id,s.id,date '2026-01-01'
from (values ('kamran','NIGHT'),('hasan','MORNING'),('mohammad','EVENING')) m(username,shift_code)
join users u on u.username=m.username
join shifts s on s.code=m.shift_code;

insert into factory_settings(key,value) values
('factory_timezone','Asia/Tehran'),
('session_days','7'),
('cloud_schema_version','2026-09-19');

-- Edge Function is the only public gateway; direct browser access to ERP tables is blocked.
alter table users enable row level security;
alter table products enable row level security;
alter table product_prices enable row level security;
alter table customers enable row level security;
alter table shifts enable row level security;
alter table operator_shifts enable row level security;
alter table shift_runs enable row level security;
alter table production_records enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table inventory_transactions enable row level security;
alter table activity_logs enable row level security;
alter table suppliers enable row level security;
alter table expenses enable row level security;
alter table factory_settings enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

commit;
