-- Boostan v3 manager controls. Non-destructive: do not rerun older migrations.
-- Apply ONLY after making a fresh database backup. Run once in Supabase SQL Editor.
begin;
set local search_path=public;
-- Legacy migrations used two spellings for partial returns. Preserve either value.
alter table sales drop constraint if exists sales_status_check;
alter table sales add constraint sales_status_check
 check (status in ('ACTIVE','CANCELLED','PARTIALLY_RETURNED','PARTIAL_RETURN','RETURNED'));
alter table sales add column if not exists sale_fingerprint text;
alter table sales add column if not exists request_id uuid;
create unique index if not exists ux_boostan_sales_request_id on sales(request_id) where request_id is not null;
create index if not exists ix_boostan_sales_fingerprint_time on sales(sale_fingerprint,sold_at desc);
create table if not exists settlement_discounts (
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id),
 payment_id uuid references payments(id) on delete set null, amount numeric(18,2) not null check(amount>0),
 note text, created_by uuid not null references users(id), created_at timestamptz not null default now()
);
alter table settlement_discounts enable row level security;
revoke all on settlement_discounts from anon, authenticated;
grant all on settlement_discounts to service_role;
create index if not exists ix_settlement_discounts_customer_time on settlement_discounts(customer_id,created_at desc);
create table if not exists sale_edits (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references sales(id),
 edited_by uuid not null references users(id), edited_at timestamptz not null default now(),
 reason text not null, before_data jsonb not null, after_data jsonb not null
);

alter table sale_edits enable row level security;
revoke all on sale_edits from anon, authenticated;
grant all on sale_edits to service_role;
-- Preserve every existing column name AND position before appending the new field.
-- The actual 2026-09-23 schema has: customer_id,name,phone,sales_total,
-- payments_total,balance,returns_total,refunds_total.
create or replace view v_customer_balances as
select c.id as customer_id,c.name,c.phone,
       coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)::numeric as sales_total,
       coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0)::numeric as payments_total,
       (
         coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id),0)
         - coalesce((select sum(sr.amount_reduction) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)
         - coalesce((select sum(p.amount) from payments p where p.customer_id=c.id),0)
         + coalesce((select sum(sr.refund_amount) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)
         - coalesce((select sum(d.amount) from settlement_discounts d where d.customer_id=c.id),0)
       )::numeric as balance,
       coalesce((select sum(sr.amount_reduction) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)::numeric as returns_total,
       coalesce((select sum(sr.refund_amount) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id),0)::numeric as refunds_total,
       coalesce((select sum(d.amount) from settlement_discounts d where d.customer_id=c.id),0)::numeric as discounts_total
from customers c
where c.is_active=true;



create or replace function boostan_payment_with_discount(p_customer uuid,p_amount numeric,p_discount numeric,p_method text,p_actor uuid,p_note text default null)
returns jsonb language plpgsql as $$
declare v_balance numeric; v_pay uuid; v_discount uuid;
begin
 if not exists(select 1 from users where id=p_actor and is_active=true and role='MANAGER') then raise exception 'فقط مدیر می‌تواند وصول ثبت کند'; end if;
 perform 1 from customers where id=p_customer and is_active=true for update;
 if not found then raise exception 'مشتری پیدا نشد'; end if;
 select balance into v_balance from v_customer_balances where customer_id=p_customer;
 if p_amount<0 or p_discount<0 or p_amount+p_discount<=0 or p_amount+p_discount>v_balance then raise exception 'مبلغ وصول و تخفیف از مانده بدهی بیشتر است یا معتبر نیست'; end if;
 if p_amount>0 then
  insert into payments(customer_id,amount,payment_method,operator_id,paid_at,note)
  values(p_customer,p_amount,p_method,p_actor,now(),nullif(p_note,'')) returning id into v_pay;
 end if;
 if p_discount>0 then
  insert into settlement_discounts(customer_id,payment_id,amount,note,created_by)
  values(p_customer,v_pay,p_discount,nullif(p_note,''),p_actor) returning id into v_discount;
  insert into financial_entries(entry_kind,direction,amount,cash_effect,source_type,source_id,occurred_at,created_by,description)
  values('OTHER','OUT',p_discount,false,'SETTLEMENT_DISCOUNT',v_discount,now(),p_actor,'تخفیف هنگام وصول بدهی');
 end if;
 perform boostan_log(p_actor,'COLLECT_DEBT','CUSTOMER',p_customer,jsonb_build_object('cash',p_amount,'discount',p_discount,'paymentId',v_pay));
 return jsonb_build_object('paymentId',v_pay,'discountId',v_discount,'amount',p_amount,'discount',p_discount,'balance',v_balance-p_amount-p_discount);
end; $$;


create or replace function boostan_counter_seven(p_value text)
returns boolean language sql immutable as $$ select translate(coalesce(p_value,''),'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789') ~ '^[0-9]{7}$' $$;

create or replace function boostan_create_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_customer uuid := nullif(p_payload->>'customerId','')::uuid; v_sold_at timestamptz := now();
  v_payment_type text := upper(coalesce(p_payload->>'paymentType','CASH')); v_payment_method text := nullif(p_payload->>'paymentMethod','');
  v_note text := nullif(p_payload->>'note',''); v_actor_role text; v_operator uuid; v_subtotal numeric := 0; v_total numeric; v_discount numeric:=0;
  v_paid numeric := 0; v_sale uuid; item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_line numeric;
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
    select coalesce(sum(case when transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then quantity when transaction_type in ('SALE','ADJUSTMENT_OUT') then -quantity else 0 end),0)
      into v_stock from inventory_transactions where product_id=v_pid;
    if v_stock<v_qty then raise exception 'موجودی ثبت‌شده برای این فروش کافی نیست'; end if;
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
 v_payment_type text; v_customer uuid; v_payment_method text; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_old_qty numeric;
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
   select coalesce(sum(case when it.transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then it.quantity when it.transaction_type in ('SALE','ADJUSTMENT_OUT') then -it.quantity else 0 end),0)
     into v_stock from inventory_transactions it where it.product_id=v_pid;
   select coalesce(sum(si.quantity),0) into v_old_qty from sale_items si where si.sale_id=s.id and si.product_id=v_pid;
   if v_stock + v_old_qty < v_qty then raise exception 'موجودی ثبت‌شده برای اصلاح این فروش کافی نیست'; end if;
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


-- Historical snapshot; unlike current balance/inventory views it obeys the chosen end date.
create or replace function boostan_snapshot_at(p_end timestamptz)
returns jsonb language sql stable as $$
select jsonb_build_object(
 'inventoryValue',coalesce((select sum(stock*price) from (
  select p.id,p.price,coalesce(sum(case when it.transaction_type in ('OPENING','PRODUCTION','SALE_RETURN','ADJUSTMENT_IN') then it.quantity when it.transaction_type in ('SALE','ADJUSTMENT_OUT') then -it.quantity else 0 end),0) stock
  from products p left join inventory_transactions it on it.product_id=p.id and it.occurred_at<p_end
  group by p.id,p.price) s),0),
 'customerDebt',coalesce((select sum(greatest(0,coalesce((select sum(s.total_amount) from sales s where s.customer_id=c.id and s.sold_at<p_end),0)
    -coalesce((select sum(sr.amount_reduction) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id and sr.returned_at<p_end),0)
    -coalesce((select sum(p.amount) from payments p where p.customer_id=c.id and p.paid_at<p_end),0)
    +coalesce((select sum(sr.refund_amount) from sale_returns sr join sales s on s.id=sr.sale_id where s.customer_id=c.id and sr.returned_at<p_end),0)
    -coalesce((select sum(d.amount) from settlement_discounts d where d.customer_id=c.id and d.created_at<p_end),0))) from customers c),0),
 'rawMaterialReadyKg',coalesce((select sum(case
   when t.transaction_type in ('OPENING','PURCHASE','GRINDING_IN','PRODUCTION_SCRAP','ADJUSTMENT_IN') then t.quantity_kg
   when t.transaction_type in ('GRINDING_OUT','PRODUCTION_CONSUMPTION','ADJUSTMENT_OUT') then -t.quantity_kg else 0 end)
   from material_transactions t join material_items m on m.id=t.material_id
   where m.code='RAW-READY' and t.occurred_at<p_end),0),
 'grindableScrapKg',coalesce((select sum(case
   when t.transaction_type in ('OPENING','PURCHASE','GRINDING_IN','PRODUCTION_SCRAP','ADJUSTMENT_IN') then t.quantity_kg
   when t.transaction_type in ('GRINDING_OUT','PRODUCTION_CONSUMPTION','ADJUSTMENT_OUT') then -t.quantity_kg else 0 end)
   from material_transactions t join material_items m on m.id=t.material_id
   where m.code='SCRAP-GRIND' and t.occurred_at<p_end),0),
 'asOf',p_end
); $$;


-- Aggregates product-level revenue and returns by their own event dates. No COGS claim is made here.
create or replace function boostan_product_performance(p_from timestamptz,p_to timestamptz)
returns table(product_id uuid,sold_units numeric,return_units numeric,gross_revenue numeric,net_revenue numeric,produced_units numeric,gross_units numeric)
language sql stable as $$
with sold as (
 select si.product_id,sum(si.quantity) sold_units,sum(si.line_total) gross_revenue,
        sum(case when s.subtotal>0 then si.line_total*s.total_amount/s.subtotal else 0 end) sold_net
 from sale_items si join sales s on s.id=si.sale_id
 where s.sold_at>=p_from and s.sold_at<=p_to
 group by si.product_id
), returned as (
 select sri.product_id,sum(sri.quantity) return_units,sum(sri.amount_reduction) return_net
 from sale_return_items sri join sale_returns sr on sr.id=sri.sale_return_id
 where sr.returned_at>=p_from and sr.returned_at<=p_to
 group by sri.product_id
), produced as (
 select pr.product_id,sum(pr.quantity) produced_units,sum(pr.gross_quantity) gross_units
 from production_records pr where pr.production_at>=p_from and pr.production_at<=p_to
 group by pr.product_id
)
select p.id,coalesce(s.sold_units,0),coalesce(r.return_units,0),coalesce(s.gross_revenue,0),
 coalesce(s.sold_net,0)-coalesce(r.return_net,0),coalesce(pr.produced_units,0),coalesce(pr.gross_units,0)
from products p left join sold s on s.product_id=p.id left join returned r on r.product_id=p.id
left join produced pr on pr.product_id=p.id;
$$;
revoke all on function boostan_product_performance(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function boostan_snapshot_at(timestamptz) from public,anon,authenticated;
grant execute on function boostan_product_performance(timestamptz,timestamptz) to service_role;

revoke all on function boostan_payment_with_discount(uuid,numeric,numeric,text,uuid,text) from public,anon,authenticated;
revoke all on function boostan_manager_edit_sale(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function boostan_payment_with_discount(uuid,numeric,numeric,text,uuid,text) to service_role;
grant execute on function boostan_manager_edit_sale(uuid,jsonb,uuid) to service_role;
grant execute on function boostan_snapshot_at(timestamptz) to service_role;
commit;
