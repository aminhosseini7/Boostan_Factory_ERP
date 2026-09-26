-- Boostan Factory ERP - update 2026-09-26
-- 1) Allow sales/manager sale edits even when recorded finished-goods stock is temporarily insufficient.
-- 2) Add 30-day / 10-day-per-zone cleaning rotation starting 1405/07/05 (2026-09-27).
-- 3) Store cleaning confirmation with each shift run for manager visibility.
-- Additive migration: old migration files are not modified.

begin;
set local search_path = public;

-- Cleaning rotation configuration. Initial 10-day block:
-- kamran -> Zone 1, hasan -> Zone 2, mohammad -> Zone 3.
create table cleaning_rotation_settings (
  id smallint primary key default 1 check (id=1),
  cycle_start_date date not null,
  updated_at timestamptz not null default now()
);
insert into cleaning_rotation_settings(id,cycle_start_date) values(1,date '2026-09-27');

create table cleaning_rotation_workers (
  user_id uuid primary key references users(id) on delete cascade,
  initial_zone smallint not null unique check (initial_zone between 1 and 3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into cleaning_rotation_workers(user_id,initial_zone)
select id,case username when 'kamran' then 1 when 'hasan' then 2 when 'mohammad' then 3 end
from users
where username in ('kamran','hasan','mohammad');

do $$
begin
  if (select count(*) from cleaning_rotation_workers where is_active) <> 3
     or (select count(distinct initial_zone) from cleaning_rotation_workers where is_active) <> 3 then
    raise exception 'Cleaning rotation setup failed: expected users kamran, hasan and mohammad';
  end if;
end $$;

alter table shift_runs
  add column cleaning_zone smallint check (cleaning_zone between 1 and 3),
  add column cleaning_done boolean not null default false,
  add column cleaning_confirmed_at timestamptz,
  add column cleaning_confirmed_by uuid references users(id) on delete set null;

create index idx_shift_runs_cleaning on shift_runs(shift_date desc,cleaning_done);

alter table cleaning_rotation_settings enable row level security;
alter table cleaning_rotation_workers enable row level security;
revoke all on cleaning_rotation_settings,cleaning_rotation_workers from public,anon,authenticated;
grant select on cleaning_rotation_settings,cleaning_rotation_workers to service_role;

create or replace function boostan_cleaning_zone(p_user uuid,p_shift_date date)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_shift_date is null or p_shift_date < s.cycle_start_date then null::smallint
    else (((w.initial_zone - 1 + (((p_shift_date - s.cycle_start_date) / 10) % 3)) % 3) + 1)::smallint
  end
  from public.cleaning_rotation_settings s
  join public.cleaning_rotation_workers w on w.is_active=true and w.user_id=p_user
  where s.id=1;
$$;

revoke all on function boostan_cleaning_zone(uuid,date) from public,anon,authenticated;
grant execute on function boostan_cleaning_zone(uuid,date) to service_role;

-- Preserve all existing view columns in their current order and append new fields.
create or replace view v_shift_runs as
select sr.id,sr.shift_id,s.code as shift_code,s.name as shift_name,sr.operator_id,u.full_name as operator_name,
       sr.product_id,p.name as product_name,sr.shift_date,sr.start_counter,sr.end_counter,sr.defects,
       sr.gross_quantity,sr.good_quantity,sr.started_at,sr.defect_recorded_at,sr.finalized_at,sr.status,sr.note,
       p.code as product_code,
       coalesce(sr.cleaning_zone,boostan_cleaning_zone(sr.operator_id,sr.shift_date)) as cleaning_zone,
       sr.cleaning_done,sr.cleaning_confirmed_at,sr.cleaning_confirmed_by
from shift_runs sr
join shifts s on s.id=sr.shift_id
join users u on u.id=sr.operator_id
join products p on p.id=sr.product_id;

create or replace view v_production_summary as
select pr.id,pr.product_id,p.name as product_name,pr.operator_id,u.full_name as operator_name,
       pr.quantity,pr.gross_quantity,pr.defects,pr.shift,pr.production_at,pr.note,pr.shift_run_id,
       p.weight_kg,
       p.code as product_code,
       boostan_cleaning_zone(pr.operator_id,coalesce(sr.shift_date,(pr.production_at at time zone 'Asia/Tehran')::date)) as cleaning_zone,
       coalesce(sr.cleaning_done,false) as cleaning_done,
       sr.cleaning_confirmed_at
from production_records pr
join products p on p.id=pr.product_id
join users u on u.id=pr.operator_id
left join shift_runs sr on sr.id=pr.shift_run_id;

-- New RPC keeps the previous end-shift workflow and atomically records cleaning.
create or replace function boostan_end_shift_with_cleaning(
  p_actor uuid,
  p_defects numeric,
  p_cleaning_done boolean default false,
  p_at timestamptz default now(),
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_role text;
  r shift_runs%rowtype;
  outrow jsonb;
  v_zone smallint;
  v_cycle_start date;
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

  v_zone := boostan_cleaning_zone(r.operator_id,r.shift_date);
  select cycle_start_date into v_cycle_start from cleaning_rotation_settings where id=1;
  if r.shift_date >= v_cycle_start and v_zone is null then
    raise exception 'Cleaning rotation is not configured for this operator';
  end if;
  if coalesce(p_cleaning_done,false) and p_actor<>r.operator_id then
    raise exception 'Cleaning can only be confirmed by the operator of this shift';
  end if;

  update shift_runs set
    defects=p_defects,
    defect_recorded_at=p_at,
    note=coalesce(nullif(p_note,''),note),
    cleaning_zone=v_zone,
    cleaning_done=coalesce(p_cleaning_done,false),
    cleaning_confirmed_at=case when coalesce(p_cleaning_done,false) then p_at else null end,
    cleaning_confirmed_by=case when coalesce(p_cleaning_done,false) then p_actor else null end,
    status=case when end_counter is null then 'AWAITING_NEXT_COUNTER' else status end,
    updated_at=now()
  where id=r.id
  returning * into r;

  if r.end_counter is not null then
    outrow := boostan_finalize_shift_run(r.id);
  else
    outrow := to_jsonb(r);
  end if;
  perform boostan_log(p_actor,'END_SHIFT','SHIFT_RUN',r.id,
    jsonb_build_object('defects',p_defects,'cleaningZone',v_zone,'cleaningDone',coalesce(p_cleaning_done,false)));
  return outrow;
end;
$$;

revoke all on function boostan_end_shift_with_cleaning(uuid,numeric,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function boostan_end_shift_with_cleaning(uuid,numeric,boolean,timestamptz,text) to service_role;

-- Sales may now drive the recorded stock temporarily below zero. The integrity
-- screen already reports negative finished-goods stock as a management warning.
create or replace function boostan_create_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_customer uuid := nullif(p_payload->>'customerId','')::uuid; v_sold_at timestamptz := now();
  v_payment_type text := upper(coalesce(p_payload->>'paymentType','CASH')); v_payment_method text := nullif(p_payload->>'paymentMethod','');
  v_note text := nullif(p_payload->>'note',''); v_actor_role text; v_operator uuid; v_subtotal numeric := 0; v_total numeric; v_discount numeric:=0;
  v_paid numeric := 0; v_sale uuid; item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_line numeric;
  v_lines jsonb := '[]'::jsonb; v_seen uuid[] := array[]::uuid[];
  v_fingerprint text; v_request uuid; v_existing uuid; v_override boolean := coalesce((p_payload->>'duplicateOverride')::boolean,false);
begin
  select role into v_actor_role from users where id=p_actor and is_active=true;
  if v_actor_role is null then raise exception 'کاربر فعال نیست'; end if;
  if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or coalesce(jsonb_array_length(p_payload->'items'),0)<1 then raise exception 'حداقل یک قلم کالا برای فروش لازم است'; end if;
  v_request := nullif(p_payload->>'requestId','')::uuid;
  if v_request is not null then
    perform pg_advisory_xact_lock(hashtextextended('request:'||v_request::text,0));
    select id into v_existing from sales where request_id=v_request;
    if found then return jsonb_build_object('id',v_existing,'duplicateRequest',true); end if;
  end if;


  v_operator := boostan_operator_for_time(v_sold_at);
  if v_actor_role='OPERATOR' then
    if v_operator is null or v_operator<>p_actor then raise exception 'زمان ثبت فروش خارج از شیفت شماست'; end if;
  end if;
  -- If manager sells when no shift operator can be resolved, manager is recorded as seller.
  if v_operator is null then v_operator:=p_actor; end if;

  if v_payment_type in ('CREDIT','MIXED') then
    if v_customer is null then raise exception 'برای فروش نسیه انتخاب مشتری الزامی است'; end if;
    if not exists(select 1 from customers where id=v_customer and is_active=true) then raise exception 'مشتری انتخاب‌شده فعال نیست'; end if;
  elsif v_payment_type not in ('CASH','CARD') then raise exception 'نوع پرداخت معتبر نیست'; end if;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    v_pid := (item->>'productId')::uuid; v_qty := (item->>'quantity')::numeric;
    if v_qty<=0 then raise exception 'تعداد فروش باید بیشتر از صفر باشد'; end if;
    if v_pid=any(v_seen) then raise exception 'یک محصول در فروش دوبار انتخاب شده است'; end if;
    v_seen := array_append(v_seen,v_pid);
    perform pg_advisory_xact_lock(hashtext(v_pid::text));
    if not exists(select 1 from products where id=v_pid and is_active=true) then raise exception 'محصول انتخاب‌شده فعال نیست'; end if;
    select pp.price into v_price from product_prices pp where pp.product_id=v_pid and pp.valid_from<=v_sold_at order by pp.valid_from desc limit 1;
    if v_price is null then select price into v_price from products where id=v_pid; end if;
    v_line:=v_qty*v_price; v_subtotal:=v_subtotal+v_line;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_pid,'quantity',v_qty,'unitPrice',v_price,'lineTotal',v_line));
  end loop;

  v_total:=coalesce(nullif(p_payload->>'customerPayableAmount','')::numeric,v_subtotal);
  if v_total<0 or v_total>v_subtotal then raise exception 'مبلغ نهایی فروش نمی‌تواند بیشتر از مبلغ محاسبه‌شده کالاها باشد'; end if;
  v_discount:=v_subtotal-v_total;
  if v_payment_type in ('CASH','CARD') then v_paid:=v_total;
  else
    v_paid:=coalesce(nullif(p_payload->>'paymentAmount','')::numeric,0);
    if v_paid<0 or v_paid>v_total then raise exception 'مبلغ پیش‌پرداخت معتبر نیست'; end if;
  end if;

  -- Advisory lock makes the ten-minute check atomic even across simultaneous manager/operator requests.
  select coalesce(jsonb_agg(x.value order by x.value->>'productId'),'[]'::jsonb) into v_lines
  from jsonb_array_elements(v_lines) x(value);
  v_fingerprint := md5(jsonb_build_object(
     'customer',v_customer,'paymentType',v_payment_type,'paymentMethod',coalesce(v_payment_method,''),
     'paid',v_paid,'total',v_total,'lines',v_lines,
     'driverPhone',coalesce(nullif(p_payload->>'driverPhone',''),''),
     'driverVehicle',coalesce(nullif(p_payload->>'driverVehicle',''),'')
  )::text);
  perform pg_advisory_xact_lock(hashtextextended('sale:'||v_fingerprint,0));
  select id into v_existing from sales
   where sale_fingerprint=v_fingerprint and sold_at>clock_timestamp()-interval '10 minutes'
   order by sold_at desc limit 1;
  if found and not v_override then raise exception 'این فروش کمتر از ۱۰ دقیقه پیش ثبت شده است'; end if;
  if found and v_override then
    if v_actor_role<>'MANAGER' then raise exception 'تأیید فروش مشابه فقط توسط مدیر مجاز است'; end if;
    if length(trim(coalesce(p_payload->>'overrideReason','')))<5 then raise exception 'علت تأیید فروش مشابه را بنویسید'; end if;
  end if;
  insert into sales(customer_id,operator_id,entered_by,subtotal,discount_amount,total_amount,payment_type,payment_amount,note,sold_at,driver_name,driver_phone,driver_vehicle,sale_fingerprint,request_id)
  values(v_customer,v_operator,p_actor,v_subtotal,v_discount,v_total,v_payment_type,v_paid,v_note,v_sold_at,
         nullif(p_payload->>'driverName',''),nullif(p_payload->>'driverPhone',''),nullif(p_payload->>'driverVehicle',''),v_fingerprint,v_request) returning id into v_sale;
  for item in select value from jsonb_array_elements(v_lines) loop
    insert into sale_items(sale_id,product_id,quantity,unit_price) values(v_sale,(item->>'productId')::uuid,(item->>'quantity')::numeric,(item->>'unitPrice')::numeric);
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values((item->>'productId')::uuid,'SALE',(item->>'quantity')::numeric,'SALE',v_sale,v_operator,v_sold_at,v_note);
  end loop;
  if v_paid>0 and v_customer is not null then
    insert into payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
    values(v_customer,v_sale,v_paid,coalesce(v_payment_method,'OTHER'),p_actor,v_sold_at,'پیش‌پرداخت همزمان با فروش');
  end if;
  if v_override and v_existing is not null then perform boostan_log(p_actor,'OVERRIDE_DUPLICATE_SALE','SALE',v_sale,jsonb_build_object('previousSaleId',v_existing,'reason',p_payload->>'overrideReason')); end if;
  perform boostan_log(p_actor,'CREATE_SALE','SALE',v_sale,jsonb_build_object('operatorId',v_operator,'total',v_total,'discount',v_discount));
  return jsonb_build_object('id',v_sale,'subtotal',v_subtotal,'discountAmount',v_discount,'totalAmount',v_total,'paymentAmount',v_paid,'soldAt',v_sold_at,'balanceDue',v_total-v_paid);
end;
$$;

create or replace function boostan_manager_edit_sale(p_sale uuid,p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
 s sales%rowtype; v_before jsonb; v_after jsonb; v_subtotal numeric:=0; v_total numeric; v_paid numeric;
 v_payment_type text; v_customer uuid; v_payment_method text; v_pid uuid; v_qty numeric; v_price numeric;
 v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb); v_row jsonb; v_seen uuid[]:=array[]::uuid[];
 v_linked payments%rowtype; v_balance numeric; v_fingerprint text; v_normalized_lines jsonb; v_reason text:=trim(coalesce(p_payload->>'reason',''));
begin
 if not exists(select 1 from users where id=p_actor and role='MANAGER' and is_active=true) then raise exception 'ویرایش فروش فقط برای مدیر مجاز است'; end if;
 if length(v_reason)<5 then raise exception 'علت ویرایش را حداقل در پنج حرف بنویسید'; end if;
 select * into s from sales where id=p_sale for update;
 if not found then raise exception 'فروش پیدا نشد'; end if;
 if s.status<>'ACTIVE' or exists(select 1 from sale_returns where sale_id=s.id) then raise exception 'فروش دارای مرجوعی/ابطال را از مسیر اصلاح حسابداری بررسی کنید'; end if;
 -- Credit collection not tied to the invoice may have occurred. Reject edits leading to overpayment.
 if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 then raise exception 'اقلام فروش معتبر نیست'; end if;
 v_payment_type:=upper(coalesce(p_payload->>'paymentType',s.payment_type));
 if v_payment_type<>s.payment_type then raise exception 'تغییر نوع پرداخت فروش قدیمی از مسیر اصلاح حسابداری انجام شود'; end if;
 v_customer:=s.customer_id;
 select payment_method into v_payment_method from payments where sale_id=s.id limit 1;
 v_payment_method:=coalesce(nullif(p_payload->>'paymentMethod',''),v_payment_method,'CARD');
 select jsonb_build_object('sale',to_jsonb(s),'items',coalesce((select jsonb_agg(to_jsonb(si)) from sale_items si where si.sale_id=s.id),'[]'::jsonb)) into v_before;
 for v_row in select value from jsonb_array_elements(v_items) loop
   v_pid:=(v_row->>'productId')::uuid; v_qty:=(v_row->>'quantity')::numeric;
   if v_qty<=0 or v_qty<>trunc(v_qty) or v_pid=any(v_seen) then raise exception 'اقلام، تعداد یا کالای تکراری معتبر نیست'; end if;
   v_seen:=array_append(v_seen,v_pid);
   perform pg_advisory_xact_lock(hashtext(v_pid::text));
   select unit_price into v_price from sale_items where sale_id=s.id and product_id=v_pid;
   if v_price is null then select price into v_price from products where id=v_pid and is_active=true; end if;
   if v_price is null then raise exception 'محصول جدید پیدا نشد یا غیرفعال است'; end if;
   v_subtotal:=v_subtotal+v_qty*v_price;
 end loop;
 v_total:=coalesce(nullif(p_payload->>'customerPayableAmount','')::numeric,v_subtotal);
 if v_total<0 or v_total>v_subtotal then raise exception 'مبلغ نهایی نامعتبر است'; end if;
 v_paid:=case when v_payment_type in ('CASH','CARD') then v_total else coalesce(nullif(p_payload->>'paymentAmount','')::numeric,s.payment_amount) end;
 if v_paid<0 or v_paid>v_total then raise exception 'پیش‌پرداخت معتبر نیست'; end if;
 if v_customer is not null then
   perform 1 from customers where id=v_customer for update;
   select balance into v_balance from v_customer_balances where customer_id=v_customer;
   if v_balance+v_total-s.total_amount+ s.payment_amount-v_paid < 0 then raise exception 'این ویرایش مانده بدهی مشتری را منفی می‌کند؛ ابتدا وصول‌ها را بررسی کنید'; end if;
 end if;
 -- No item can have a return (guarded above). Adjustment affects this sale only.
 delete from inventory_transactions where reference_type='SALE' and reference_id=s.id and transaction_type='SALE';
 delete from sale_items where sale_id=s.id;
 for v_row in select value from jsonb_array_elements(v_items) loop
   v_pid:=(v_row->>'productId')::uuid; v_qty:=(v_row->>'quantity')::numeric;
   select (x->>'unit_price')::numeric into v_price from jsonb_array_elements(v_before->'items') x where (x->>'product_id')::uuid=v_pid limit 1;
   if v_price is null then select price into v_price from products where id=v_pid; end if;
   insert into sale_items(sale_id,product_id,quantity,unit_price) values(s.id,v_pid,v_qty,v_price);
   insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
   values(v_pid,'SALE',v_qty,'SALE',s.id,s.operator_id,s.sold_at,'اصلاح فروش توسط مدیر');
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('productId',si.product_id,'quantity',si.quantity,'unitPrice',si.unit_price,'lineTotal',si.line_total) order by si.product_id::text),'[]'::jsonb)
 into v_normalized_lines from sale_items si where si.sale_id=s.id;
 v_fingerprint:=md5(jsonb_build_object('customer',v_customer,'paymentType',v_payment_type,
 'paymentMethod',case when v_customer is null then '' else v_payment_method end,
 'paid',v_paid,'total',v_total,'lines',v_normalized_lines,
 'driverPhone',coalesce(nullif(p_payload->>'driverPhone',''),s.driver_phone,''),
 'driverVehicle',coalesce(nullif(p_payload->>'driverVehicle',''),s.driver_vehicle,''))::text);
 update sales set subtotal=v_subtotal,total_amount=v_total,discount_amount=v_subtotal-v_total,payment_amount=v_paid,
  sale_fingerprint=v_fingerprint, note=nullif(coalesce(p_payload->>'note',s.note),''), driver_name=nullif(coalesce(p_payload->>'driverName',s.driver_name),''),
  driver_phone=nullif(coalesce(p_payload->>'driverPhone',s.driver_phone),''),driver_vehicle=nullif(coalesce(p_payload->>'driverVehicle',s.driver_vehicle),'') where id=s.id;
 if v_customer is not null then
  select * into v_linked from payments where sale_id=s.id for update;
  if found then
    if v_paid>0 then
      update payments set amount=v_paid,payment_method=v_payment_method where id=v_linked.id;
      update financial_entries set amount=v_paid where source_type='PAYMENT' and source_id=v_linked.id and entry_kind='CUSTOMER_RECEIPT';
    else
      delete from financial_entries where source_type='PAYMENT' and source_id=v_linked.id;
      delete from payments where id=v_linked.id;
    end if;
  elsif v_paid>0 then
    insert into payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
    values(v_customer,s.id,v_paid,v_payment_method,p_actor,s.sold_at,'پیش‌پرداخت اصلاح‌شده');
  end if;
 end if;
 update financial_entries set amount=v_total where source_type='SALE' and source_id=s.id and entry_kind='SALE_REVENUE';
 update financial_entries set amount=v_paid where source_type='SALE' and source_id=s.id and entry_kind='CUSTOMER_RECEIPT';
 select jsonb_build_object('sale',to_jsonb(s2),'items',coalesce((select jsonb_agg(to_jsonb(si)) from sale_items si where si.sale_id=s.id),'[]'::jsonb))
 into v_after from sales s2 where s2.id=s.id;
 insert into sale_edits(sale_id,edited_by,reason,before_data,after_data) values(s.id,p_actor,v_reason,v_before,v_after);
 perform boostan_log(p_actor,'EDIT_SALE','SALE',s.id,jsonb_build_object('reason',v_reason,'oldTotal',s.total_amount,'newTotal',v_total));
 return jsonb_build_object('id',s.id,'oldTotal',s.total_amount,'newTotal',v_total);
end; $$;


-- Keep the grants of the replaced sale functions explicit.
revoke all on function boostan_create_sale(jsonb,uuid) from public,anon,authenticated;
revoke all on function boostan_manager_edit_sale(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function boostan_create_sale(jsonb,uuid) to service_role;
grant execute on function boostan_manager_edit_sale(uuid,jsonb,uuid) to service_role;

commit;
