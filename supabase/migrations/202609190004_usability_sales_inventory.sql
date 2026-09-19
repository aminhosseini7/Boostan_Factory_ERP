-- Boostan ERP v2.3 usability + flexible operations (non-destructive)

-- Allow an operator to register the start counter throughout their assigned shift,
-- with a small early grace period. This avoids forcing registration at an exact minute.
create or replace function boostan_shift_for_start(p_actor uuid,p_at timestamptz default now())
returns uuid language plpgsql stable as $$
declare
  v_local_time time := (p_at at time zone 'Asia/Tehran')::time;
  v_local_date date := (p_at at time zone 'Asia/Tehran')::date;
  v_id uuid;
begin
  select s.id into v_id
  from shifts s
  join operator_shifts os on os.shift_id=s.id and os.user_id=p_actor and os.is_active=true
  where s.is_active=true
    and os.valid_from<=v_local_date and (os.valid_to is null or os.valid_to>=v_local_date)
    and (
      (s.start_time < s.end_time and v_local_time >= (s.start_time - interval '30 minutes')::time and v_local_time < s.end_time)
      or
      (s.start_time > s.end_time and (v_local_time >= (s.start_time - interval '30 minutes')::time or v_local_time < s.end_time))
    )
  order by s.start_time
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
  v_shift uuid; v_expected uuid; v_role text; v_local_date date; v_local_time time; v_shift_start time; v_shift_date date;
  v_prev shift_runs%rowtype; v_new shift_runs%rowtype; v_prod_active boolean;
begin
  if p_counter < 0 then raise exception 'عدد کانتر نمی‌تواند منفی باشد'; end if;
  select role into v_role from users where id=p_actor and is_active=true;
  if v_role is null then raise exception 'کاربر فعال نیست'; end if;
  select is_active into v_prod_active from products where id=p_product;
  if coalesce(v_prod_active,false)=false then raise exception 'محصول انتخاب‌شده فعال نیست'; end if;

  v_shift := boostan_shift_for_start(p_actor,p_at);
  if v_shift is null then
    if v_role='OPERATOR' then raise exception 'در این ساعت شیفت فعالی برای شما تعریف نشده است';
    else raise exception 'در این ساعت شیفت فعالی پیدا نشد'; end if;
  end if;

  v_local_date := (p_at at time zone 'Asia/Tehran')::date;
  v_local_time := (p_at at time zone 'Asia/Tehran')::time;
  select start_time into v_shift_start from shifts where id=v_shift;
  if v_shift_start > time '12:00' and v_local_time < time '12:00' then v_shift_date := v_local_date-1; else v_shift_date := v_local_date; end if;

  v_expected := boostan_operator_for_shift_date(v_shift,v_shift_date);
  if v_expected is null then raise exception 'برای این شیفت اپراتوری تعیین نشده است'; end if;
  if v_role='OPERATOR' and v_expected<>p_actor then raise exception 'این شیفت متعلق به حساب شما نیست'; end if;
  if exists(select 1 from shift_runs where shift_id=v_shift and shift_date=v_shift_date) then raise exception 'کانتر شروع این شیفت قبلاً ثبت شده است'; end if;

  select * into v_prev from shift_runs where status<>'FINALIZED' and end_counter is null order by started_at desc limit 1 for update;
  if found then
    if p_counter < v_prev.start_counter then raise exception 'عدد کانتر نمی‌تواند از کانتر قبلی کمتر باشد'; end if;
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

-- Sale total is entered as the final amount agreed with the customer. Discount is derived automatically.
-- Negative finished-goods inventory is allowed to support pre-sales and delayed production posting.
create or replace function boostan_create_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_customer uuid := nullif(p_payload->>'customerId','')::uuid; v_sold_at timestamptz := now();
  v_payment_type text := upper(coalesce(p_payload->>'paymentType','CASH')); v_payment_method text := nullif(p_payload->>'paymentMethod','');
  v_note text := nullif(p_payload->>'note',''); v_actor_role text; v_operator uuid; v_subtotal numeric := 0; v_total numeric; v_discount numeric:=0;
  v_paid numeric := 0; v_sale uuid; item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_line numeric;
  v_lines jsonb := '[]'::jsonb; v_seen uuid[] := array[]::uuid[];
begin
  select role into v_actor_role from users where id=p_actor and is_active=true;
  if v_actor_role is null then raise exception 'کاربر فعال نیست'; end if;
  if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or coalesce(jsonb_array_length(p_payload->'items'),0)<1 then raise exception 'حداقل یک قلم کالا برای فروش لازم است'; end if;

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

  insert into sales(customer_id,operator_id,entered_by,subtotal,discount_amount,total_amount,payment_type,payment_amount,note,sold_at,driver_name,driver_phone,driver_vehicle)
  values(v_customer,v_operator,p_actor,v_subtotal,v_discount,v_total,v_payment_type,v_paid,v_note,v_sold_at,
         nullif(p_payload->>'driverName',''),nullif(p_payload->>'driverPhone',''),nullif(p_payload->>'driverVehicle','')) returning id into v_sale;
  for item in select value from jsonb_array_elements(v_lines) loop
    insert into sale_items(sale_id,product_id,quantity,unit_price) values(v_sale,(item->>'productId')::uuid,(item->>'quantity')::numeric,(item->>'unitPrice')::numeric);
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values((item->>'productId')::uuid,'SALE',(item->>'quantity')::numeric,'SALE',v_sale,v_operator,v_sold_at,v_note);
  end loop;
  if v_paid>0 and v_customer is not null then
    insert into payments(customer_id,sale_id,amount,payment_method,operator_id,paid_at,note)
    values(v_customer,v_sale,v_paid,coalesce(v_payment_method,'OTHER'),p_actor,v_sold_at,'پیش‌پرداخت همزمان با فروش');
  end if;
  perform boostan_log(p_actor,'CREATE_SALE','SALE',v_sale,jsonb_build_object('operatorId',v_operator,'total',v_total,'discount',v_discount));
  return jsonb_build_object('id',v_sale,'subtotal',v_subtotal,'discountAmount',v_discount,'totalAmount',v_total,'paymentAmount',v_paid,'soldAt',v_sold_at,'balanceDue',v_total-v_paid);
end;
$$;

-- Purchase descriptions are derived by the system; raw/scrap/other are kg, finished products are count.
create or replace function boostan_create_purchase(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_id uuid; v_product uuid:=nullif(p_payload->>'productId','')::uuid; v_material uuid:=nullif(p_payload->>'materialId','')::uuid;
  v_type text:=upper(coalesce(p_payload->>'purchaseType','OTHER')); v_qty numeric:=coalesce(nullif(p_payload->>'quantity','')::numeric,0);
  v_weight numeric:=coalesce(nullif(p_payload->>'weightKg','')::numeric,0); v_price numeric:=coalesce(nullif(p_payload->>'unitPrice','')::numeric,0);
  v_name text; v_unit text; v_default uuid;
begin
  if v_type not in ('RAW_MATERIAL','FINISHED_PRODUCT','USED_SCRAP','OTHER') then raise exception 'نوع خرید معتبر نیست'; end if;
  if v_price<0 then raise exception 'قیمت معتبر نیست'; end if;
  if v_type='FINISHED_PRODUCT' then
    if v_product is null then raise exception 'برای خرید سبد آماده، محصول را انتخاب کنید'; end if;
    if v_qty<=0 then raise exception 'تعداد سبد باید بیشتر از صفر باشد'; end if;
    select name,coalesce(v_qty*weight_kg,0) into v_name,v_weight from products where id=v_product;
    v_unit:='عدد';
  else
    if v_weight<=0 then v_weight:=v_qty; end if;
    if v_weight<=0 then raise exception 'وزن خرید به کیلوگرم الزامی است'; end if;
    v_qty:=v_weight; v_unit:='کیلوگرم';
    v_default:=boostan_material_id(case when v_type in ('USED_SCRAP','OTHER') then 'SCRAP-GRIND' else 'RAW-READY' end);
    v_material:=coalesce(v_material,v_default);
    if v_material is null then raise exception 'انبار مواد برای این نوع خرید تعریف نشده است'; end if;
    v_name:=case v_type when 'RAW_MATERIAL' then 'مواد اولیه مستقیم' when 'USED_SCRAP' then 'سبد دست دوم / ضایعات قابل آسیاب' else 'سایر ضایعات' end;
  end if;
  insert into purchases(purchase_type,supplier_name,item_name,product_id,quantity,unit,unit_price,weight_kg,inventory_material_id,purchased_at,note,created_by)
  values(v_type,nullif(p_payload->>'supplierName',''),v_name,v_product,v_qty,v_unit,v_price,v_weight,v_material,now(),nullif(p_payload->>'note',''),p_actor) returning id into v_id;
  if v_type='FINISHED_PRODUCT' then
    insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
    values(v_product,'ADJUSTMENT_IN',v_qty,'PURCHASE',v_id,p_actor,now(),'خرید سبد آماده');
  else
    insert into material_transactions(material_id,transaction_type,quantity_kg,unit_cost,reference_type,reference_id,occurred_at,created_by,note)
    values(v_material,'PURCHASE',v_weight,v_price,'PURCHASE',v_id,now(),p_actor,v_name);
  end if;
  perform boostan_log(p_actor,'CREATE_PURCHASE','PURCHASE',v_id,jsonb_build_object('purchaseType',v_type,'quantity',v_qty,'weightKg',v_weight,'unitPrice',v_price));
  return jsonb_build_object('id',v_id,'purchaseType',v_type,'quantity',v_qty,'weightKg',v_weight,'unitPrice',v_price,'totalAmount',v_qty*v_price,'materialId',v_material);
end;
$$;

-- Grinding may be recorded even if the bookkeeping stock is temporarily insufficient.
create or replace function boostan_create_grinding(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_id uuid; v_bags integer:=coalesce(nullif(p_payload->>'bagCount','')::integer,0); v_bag_weight numeric:=coalesce(nullif(p_payload->>'bagWeightKg','')::numeric,0);
  v_weight numeric; v_mode text:=upper(coalesce(p_payload->>'costMode','DAILY')); v_daily numeric:=coalesce(nullif(p_payload->>'dailyCost','')::numeric,0);
  v_perkg numeric:=coalesce(nullif(p_payload->>'costPerKg','')::numeric,0); v_cost numeric;
  v_input uuid:=coalesce(nullif(p_payload->>'inputMaterialId','')::uuid,boostan_material_id('SCRAP-GRIND'));
  v_output uuid:=coalesce(nullif(p_payload->>'outputMaterialId','')::uuid,boostan_material_id('RAW-READY'));
begin
  if v_bags<=0 or v_bag_weight<=0 then raise exception 'تعداد گونی و وزن هر گونی الزامی است'; end if;
  if v_mode not in ('DAILY','PER_KG') then raise exception 'روش محاسبه هزینه آسیاب معتبر نیست'; end if;
  v_weight:=v_bags*v_bag_weight; v_cost:=case when v_mode='PER_KG' then v_weight*v_perkg else v_daily end;
  if v_cost<0 then raise exception 'هزینه آسیاب معتبر نیست'; end if;
  if v_input is null or v_output is null then raise exception 'انبارهای مواد مربوط به آسیاب تعریف نشده‌اند'; end if;
  insert into grinding_records(defective_count,approx_weight_each,labor_cost,bag_count,bag_weight_kg,cost_mode,daily_cost,cost_per_kg,input_material_id,output_material_id,ground_at,note,created_by)
  values(v_bags,v_bag_weight,v_cost,v_bags,v_bag_weight,v_mode,v_daily,v_perkg,v_input,v_output,now(),nullif(p_payload->>'note',''),p_actor) returning id into v_id;
  insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
  values(v_input,'GRINDING_OUT',v_weight,'GRINDING',v_id,now(),p_actor,'خروج ضایعات برای آسیاب');
  insert into material_transactions(material_id,transaction_type,quantity_kg,reference_type,reference_id,occurred_at,created_by,note)
  values(v_output,'GRINDING_IN',v_weight,'GRINDING',v_id,now(),p_actor,'ورود مواد آسیاب‌شده به مواد اولیه آماده');
  perform boostan_log(p_actor,'CREATE_GRINDING','GRINDING',v_id,jsonb_build_object('bagCount',v_bags,'bagWeightKg',v_bag_weight,'totalWeightKg',v_weight,'costMode',v_mode,'totalCost',v_cost));
  return jsonb_build_object('id',v_id,'bagCount',v_bags,'bagWeightKg',v_bag_weight,'totalWeightKg',v_weight,'costMode',v_mode,'totalCost',v_cost,'groundAt',now());
end;
$$;

-- Return reason is optional; note remains available.
create or replace function boostan_return_sale(p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql as $$
declare
  v_sale sales%rowtype; v_return_id uuid; v_type text:=upper(coalesce(p_payload->>'returnType','RETURN'));
  v_refund numeric:=coalesce(nullif(p_payload->>'refundAmount','')::numeric,0); v_reduction numeric:=0; v_reason text:=nullif(trim(coalesce(p_payload->>'reason','')),'');
  item jsonb; si sale_items%rowtype; v_prev_qty numeric; v_qty numeric; v_item_reduction numeric; v_factor numeric;
begin
  if v_type not in ('RETURN','CANCEL') then raise exception 'نوع عملیات مرجوعی معتبر نیست'; end if;
  select * into v_sale from sales where id=(p_payload->>'saleId')::uuid for update;
  if not found then raise exception 'فروش پیدا نشد'; end if;
  if v_sale.status='CANCELLED' then raise exception 'این فروش قبلاً ابطال شده است'; end if;
  v_factor:=case when v_sale.subtotal>0 then v_sale.total_amount/v_sale.subtotal else 1 end;
  insert into sale_returns(sale_id,return_type,amount_reduction,refund_amount,reason,note,returned_at,created_by)
  values(v_sale.id,v_type,0,v_refund,v_reason,nullif(p_payload->>'note',''),now(),p_actor) returning id into v_return_id;
  if v_type='CANCEL' then
    for si in select * from sale_items where sale_id=v_sale.id loop
      select coalesce(sum(sri.quantity),0) into v_prev_qty from sale_return_items sri where sri.sale_item_id=si.id; v_qty:=si.quantity-v_prev_qty;
      if v_qty>0 then
        v_item_reduction:=round(v_qty*si.unit_price*v_factor,2);
        insert into sale_return_items(sale_return_id,sale_item_id,product_id,quantity,amount_reduction) values(v_return_id,si.id,si.product_id,v_qty,v_item_reduction);
        insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
        values(si.product_id,'SALE_RETURN',v_qty,'SALE_RETURN',v_return_id,p_actor,now(),coalesce(v_reason,'مرجوعی/ابطال فروش'));
        v_reduction:=v_reduction+v_item_reduction;
      end if;
    end loop;
  else
    if coalesce(jsonb_typeof(p_payload->'items'),'')<>'array' or jsonb_array_length(p_payload->'items')<1 then raise exception 'حداقل یک قلم مرجوعی لازم است'; end if;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      select * into si from sale_items where id=(item->>'saleItemId')::uuid and sale_id=v_sale.id; if not found then raise exception 'قلم فروش پیدا نشد'; end if;
      v_qty:=(item->>'quantity')::numeric; select coalesce(sum(sri.quantity),0) into v_prev_qty from sale_return_items sri where sri.sale_item_id=si.id;
      if v_qty<=0 or v_prev_qty+v_qty>si.quantity then raise exception 'تعداد مرجوعی از تعداد قابل مرجوع بیشتر است'; end if;
      v_item_reduction:=round(v_qty*si.unit_price*v_factor,2);
      insert into sale_return_items(sale_return_id,sale_item_id,product_id,quantity,amount_reduction) values(v_return_id,si.id,si.product_id,v_qty,v_item_reduction);
      insert into inventory_transactions(product_id,transaction_type,quantity,reference_type,reference_id,operator_id,occurred_at,note)
      values(si.product_id,'SALE_RETURN',v_qty,'SALE_RETURN',v_return_id,p_actor,now(),coalesce(v_reason,'مرجوعی فروش'));
      v_reduction:=v_reduction+v_item_reduction;
    end loop;
  end if;
  if v_refund<0 or v_refund>v_reduction then raise exception 'مبلغ بازپرداخت نمی‌تواند بیشتر از ارزش کالای مرجوعی باشد'; end if;
  update sale_returns set amount_reduction=v_reduction where id=v_return_id;
  update sales set status=case when v_type='CANCEL' then 'CANCELLED' when v_reduction>=greatest(total_amount-returned_amount,0) then 'RETURNED' else 'PARTIAL_RETURN' end,
    returned_amount=returned_amount+v_reduction where id=v_sale.id;
  perform boostan_log(p_actor,'RETURN_SALE','SALE_RETURN',v_return_id,jsonb_build_object('saleId',v_sale.id,'type',v_type,'amountReduction',v_reduction,'refund',v_refund));
  return jsonb_build_object('id',v_return_id,'saleId',v_sale.id,'returnType',v_type,'amountReduction',v_reduction,'refundAmount',v_refund);
end;
$$;

grant execute on function boostan_create_sale(jsonb,uuid) to service_role;
grant execute on function boostan_create_purchase(jsonb,uuid) to service_role;
grant execute on function boostan_create_grinding(jsonb,uuid) to service_role;
grant execute on function boostan_return_sale(jsonb,uuid) to service_role;
