import { createClient } from 'npm:@supabase/supabase-js@2.95.0'
import bcrypt from 'npm:bcryptjs@2.4.3'
import jwt from 'npm:jsonwebtoken@9.0.2'

type AppUser = { id: string; username: string; fullName: string; role: 'MANAGER' | 'OPERATOR' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function secretKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.default === 'string') return parsed.default
      const first = Object.values(parsed).find((x) => typeof x === 'string')
      if (first) return String(first)
    } catch (_) { /* ignore */ }
  }
  throw new Error('Supabase secret key is not available to the Edge Function')
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const db = createClient(supabaseUrl, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })
}

function fail(message: string, status = 400, details?: unknown) {
  return json({ success: false, message, ...(details ? { details } : {}) }, status)
}

function normalizePath(pathname: string) {
  let p = pathname.replace(/^\/functions\/v1\/erp-api/, '').replace(/^\/erp-api/, '')
  if (!p) p = '/'
  return p
}

function jwtSecret() {
  const s = Deno.env.get('BOOSTAN_JWT_SECRET')
  if (!s || s.length < 24) throw new Error('BOOSTAN_JWT_SECRET is missing or too short')
  return s
}

async function authUser(req: Request): Promise<AppUser> {
  const h = req.headers.get('authorization') || ''
  if (!h.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'), { status: 401 })
  let payload: any
  try { payload = jwt.verify(h.slice(7), jwtSecret()) } catch (_) {
    throw Object.assign(new Error('Session expired or invalid'), { status: 401 })
  }
  const { data, error } = await db.from('users').select('id,username,full_name,role,is_active').eq('id', payload.id).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active) throw Object.assign(new Error('User is inactive'), { status: 401 })
  return { id: data.id, username: data.username, fullName: data.full_name, role: data.role }
}

function manager(user: AppUser) {
  if (user.role !== 'MANAGER') throw Object.assign(new Error('Manager access required'), { status: 403 })
}

async function body(req: Request) {
  try { return await req.json() } catch (_) { return {} }
}

function normalizeDigits(v:any){return String(v??'').replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٬,]/g,'').replace(/٫/g,'.')}
function n(v: any) { const x=Number(normalizeDigits(v)); return Number.isFinite(x)?x:0 }

function mapProduct(x: any) {
  return { id: x.id, code: x.code, name: x.name, unit: x.unit, price: n(x.price), weightKg: n(x.weight_kg), minimumStock: n(x.minimum_stock), isActive: x.is_active, createdAt: x.created_at, updatedAt: x.updated_at }
}
function mapCustomer(x: any) {
  return { id: x.id, name: x.name, phone: x.phone, address: x.address, isActive: x.is_active, createdAt: x.created_at }
}
function mapSale(x: any) {
  return { id: x.id, customerId: x.customer_id, customerName: x.customer_name || null, operatorId: x.operator_id, operatorName: x.operator_name, enteredBy: x.entered_by, enteredByName: x.entered_by_name, subtotal: n(x.subtotal), discountAmount: n(x.discount_amount), totalAmount: n(x.total_amount), returnedAmount: n(x.returned_amount), netTotal: x.net_total == null ? n(x.total_amount) : n(x.net_total), paymentType: x.payment_type, paymentAmount: n(x.payment_amount), driverName: x.driver_name, driverPhone: x.driver_phone, driverVehicle: x.driver_vehicle, status: x.status || 'ACTIVE', note: x.note, soldAt: x.sold_at }
}
function mapProduction(x: any) {
  return { id: x.id, productId: x.product_id, productName: x.product_name, operatorId: x.operator_id, operatorName: x.operator_name, quantity: n(x.quantity), grossQuantity: n(x.gross_quantity), defects: n(x.defects), shift: x.shift, productionAt: x.production_at, note: x.note, shiftRunId: x.shift_run_id }
}
function mapRun(x: any) {
  return { id: x.id, shiftId: x.shift_id, shiftCode: x.shift_code, shiftName: x.shift_name, operatorId: x.operator_id, operatorName: x.operator_name, productId: x.product_id, productName: x.product_name, shiftDate: x.shift_date, startCounter: n(x.start_counter), endCounter: x.end_counter == null ? null : n(x.end_counter), defects: x.defects == null ? null : n(x.defects), grossQuantity: x.gross_quantity == null ? null : n(x.gross_quantity), goodQuantity: x.good_quantity == null ? null : n(x.good_quantity), startedAt: x.started_at, defectRecordedAt: x.defect_recorded_at, finalizedAt: x.finalized_at, status: x.status, note: x.note }
}

async function login(req: Request) {
  const b = await body(req)
  const username = String(b.username || '').trim()
  const password = String(b.password || '')
  if (!username || !password) return fail('نام کاربری و رمز عبور الزامی است', 400)
  const { data, error } = await db.from('users').select('id,username,full_name,password_hash,role,is_active').eq('username', username).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active || !(await bcrypt.compare(password, data.password_hash))) return fail('نام کاربری یا رمز عبور اشتباه است', 401)
  const user: AppUser = { id: data.id, username: data.username, fullName: data.full_name, role: data.role }
  const token = jwt.sign({ id: user.id, username: user.username, fullName: user.fullName, role: user.role }, jwtSecret(), { expiresIn: '7d' })
  await db.from('activity_logs').insert({ user_id: user.id, action: 'LOGIN', entity_type: 'USER', entity_id: user.id, details: { username } })
  return json({ token, user })
}

async function products(req: Request, path: string, method: string, user: AppUser, url: URL) {
  const id = path.match(/^\/products\/([0-9a-f-]+)$/i)?.[1]
  if (method === 'GET' && path === '/products') {
    const q = (url.searchParams.get('search') || '').trim()
    let query = db.from('products').select('*').order('is_active', { ascending: false }).order('name')
    if (q) query = query.or(`name.ilike.%${q.replaceAll(',', '')}%,code.ilike.%${q.replaceAll(',', '')}%`)
    const { data, error } = await query
    if (error) throw error
    return json((data || []).map(mapProduct))
  }
  if (method === 'GET' && id) {
    const { data, error } = await db.from('products').select('*').eq('id', id).maybeSingle(); if (error) throw error
    if (!data) return fail('محصول پیدا نشد', 404)
    return json(mapProduct(data))
  }
  if (method === 'POST' && path === '/products') {
    manager(user); const b = await body(req)
    const price = n(b.price), opening = n(b.openingStock), minimum = n(b.minimumStock), weightKg = n(b.weightKg)
    if (!String(b.name || '').trim() || !String(b.unit || '').trim() || price < 0 || minimum < 0 || opening < 0 || weightKg < 0) return fail('اطلاعات محصول معتبر نیست')
    const { data, error } = await db.from('products').insert({ code: b.code || null, name: String(b.name).trim(), unit: String(b.unit).trim(), price, minimum_stock: minimum, weight_kg: weightKg }).select().single(); if (error) throw error
    await db.from('product_prices').insert({ product_id: data.id, price, valid_from: new Date().toISOString(), created_by: user.id })
    if (opening > 0) await db.from('inventory_transactions').insert({ product_id: data.id, transaction_type: 'OPENING', quantity: opening, reference_type: 'PRODUCT', operator_id: user.id, note: 'Opening stock' })
    await db.from('activity_logs').insert({ user_id: user.id, action: 'CREATE_PRODUCT', entity_type: 'PRODUCT', entity_id: data.id, details: { name: data.name } })
    return json(mapProduct(data), 201)
  }
  if (method === 'PUT' && id) {
    manager(user); const b = await body(req)
    const { data: old, error: e0 } = await db.from('products').select('*').eq('id', id).maybeSingle(); if (e0) throw e0
    if (!old) return fail('محصول پیدا نشد', 404)
    const price = n(b.price), minimum = n(b.minimumStock), weightKg = n(b.weightKg)
    const { data, error } = await db.from('products').update({ code: b.code || null, name: String(b.name || '').trim(), unit: String(b.unit || '').trim(), price, minimum_stock: minimum, weight_kg: weightKg, updated_at: new Date().toISOString() }).eq('id', id).select().single(); if (error) throw error
    if (n(old.price) !== price) await db.from('product_prices').insert({ product_id: id, price, valid_from: new Date().toISOString(), created_by: user.id })
    await db.from('activity_logs').insert({ user_id: user.id, action: 'UPDATE_PRODUCT', entity_type: 'PRODUCT', entity_id: id, details: { oldPrice: n(old.price), newPrice: price } })
    return json(mapProduct(data))
  }
  if (method === 'DELETE' && id) {
    manager(user); const { data, error } = await db.from('products').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle(); if (error) throw error
    if (!data) return fail('محصول پیدا نشد', 404)
    return json({ id, deactivated: true })
  }
  return null
}

async function customers(req: Request, path: string, method: string, user: AppUser, url: URL) {
  const statementId = path.match(/^\/customers\/([0-9a-f-]+)\/statement$/i)?.[1]
  const id = path.match(/^\/customers\/([0-9a-f-]+)$/i)?.[1]
  if (method === 'GET' && path === '/customers') {
    const q = (url.searchParams.get('search') || '').trim()
    let query = db.from('customers').select('*').order('is_active', { ascending: false }).order('name')
    if (q) query = query.or(`name.ilike.%${q.replaceAll(',', '')}%,phone.ilike.%${q.replaceAll(',', '')}%`)
    const { data, error } = await query; if (error) throw error
    return json((data || []).map(mapCustomer))
  }
  if (method === 'GET' && statementId) {
    manager(user)
    const [{ data: customer, error: ec }, { data: sales, error: es }, { data: pays, error: ep }, { data: bal, error: eb }] = await Promise.all([
      db.from('customers').select('*').eq('id', statementId).maybeSingle(),
      db.from('v_sales_summary').select('id,total_amount,net_total,returned_amount,payment_type,payment_amount,status,sold_at').eq('customer_id', statementId).order('sold_at', { ascending: false }),
      db.from('payments').select('id,sale_id,amount,payment_method,paid_at,note').eq('customer_id', statementId).order('paid_at', { ascending: false }),
      db.from('v_customer_balances').select('balance').eq('customer_id', statementId).maybeSingle(),
    ])
    if (ec || es || ep || eb) throw ec || es || ep || eb
    if (!customer) return fail('مشتری پیدا نشد', 404)
    return json({ customer: mapCustomer(customer), sales: (sales || []).map(x => ({ id: x.id, totalAmount: n(x.total_amount), netTotal: n(x.net_total), returnedAmount: n(x.returned_amount), paymentType: x.payment_type, paymentAmount: n(x.payment_amount), status: x.status, soldAt: x.sold_at })), payments: (pays || []).map(x => ({ id: x.id, saleId: x.sale_id, amount: n(x.amount), paymentMethod: x.payment_method, paidAt: x.paid_at, note: x.note })), balance: n(bal?.balance) })
  }
  if (method === 'GET' && id) {
    const { data, error } = await db.from('customers').select('*').eq('id', id).maybeSingle(); if (error) throw error
    if (!data) return fail('مشتری پیدا نشد', 404)
    return json(mapCustomer(data))
  }
  if (method === 'POST' && path === '/customers') {
    const b = await body(req); const name = String(b.name || '').trim(); if (!name) return fail('نام مشتری الزامی است')
    const phone = normalizeDigits(String(b.phone || '').trim()) || null
    if(phone&&!/^\d{11}$/.test(phone))return fail('شماره تماس مشتری باید ۱۱ رقم باشد')
    const { data, error } = await db.from('customers').insert({ name, phone, address: String(b.address || '').trim() || null }).select().single(); if (error) throw error
    await db.from('activity_logs').insert({ user_id: user.id, action: 'CREATE_CUSTOMER', entity_type: 'CUSTOMER', entity_id: data.id, details: { name } })
    return json(mapCustomer(data), 201)
  }
  if (method === 'PUT' && id) {
    manager(user); const b = await body(req)
    const customerPhone = normalizeDigits(String(b.phone || '').trim()) || null
    if(customerPhone&&!/^\d{11}$/.test(customerPhone))return fail('شماره تماس مشتری باید ۱۱ رقم باشد')
    const { data, error } = await db.from('customers').update({ name: String(b.name || '').trim(), phone: customerPhone, address: String(b.address || '').trim() || null, updated_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(); if (error) throw error
    if (!data) return fail('مشتری پیدا نشد', 404)
    return json(mapCustomer(data))
  }
  return null
}

async function production(req: Request, path: string, method: string, user: AppUser) {
  if (method === 'GET' && path === '/production') {
    let q = db.from('v_production_summary').select('*').order('production_at', { ascending: false }).limit(500)
    if (user.role !== 'MANAGER') q = q.eq('operator_id', user.id)
    const { data, error } = await q; if (error) throw error
    return json((data || []).map(mapProduction))
  }
  if (method === 'GET' && path === '/production/runs') {
    let q = db.from('v_shift_runs').select('*').order('started_at', { ascending: false }).limit(500)
    if (user.role !== 'MANAGER') q = q.eq('operator_id', user.id)
    const { data, error } = await q; if (error) throw error
    return json((data || []).map(mapRun))
  }
  if (method === 'GET' && path === '/production/status') {
    const { data, error } = await db.from('v_shift_runs').select('*').eq('operator_id', user.id).neq('status', 'FINALIZED').order('started_at', { ascending: false }).limit(1); if (error) throw error
    return json(data?.[0] ? mapRun(data[0]) : null)
  }
  if (method === 'POST' && path === '/production/start') {
    const b = await body(req)
    if (!b.productId || b.counterStart === '' || b.counterStart == null) return fail('محصول و کانتر شروع الزامی است')
    const { data, error } = await db.rpc('boostan_start_shift', { p_actor: user.id, p_product: b.productId, p_counter: n(b.counterStart), p_at: new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  if (method === 'POST' && path === '/production/end') {
    const b = await body(req)
    if (b.defects === '' || b.defects == null || n(b.defects) < 0) return fail('تعداد معیوب معتبر نیست')
    const { data, error } = await db.rpc('boostan_end_shift', { p_actor: user.id, p_defects: n(b.defects), p_at: new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  return null
}

async function sales(req: Request, path: string, method: string, user: AppUser) {
  const id = path.match(/^\/sales\/([0-9a-f-]+)$/i)?.[1]
  if (method === 'GET' && path === '/sales') {
    let q = db.from('v_sales_summary').select('*').order('sold_at', { ascending: false }).limit(500)
    if (user.role !== 'MANAGER') q = q.eq('operator_id', user.id)
    const { data, error } = await q; if (error) throw error
    return json((data || []).map(mapSale))
  }
  if (method === 'GET' && id) {
    let q = db.from('v_sales_summary').select('*').eq('id', id)
    if (user.role !== 'MANAGER') q = q.eq('operator_id', user.id)
    const { data, error } = await q.maybeSingle(); if (error) throw error
    if (!data) return fail('فروش پیدا نشد', 404)
    const { data: items, error: ei } = await db.from('sale_items').select('id,product_id,quantity,unit_price,line_total,products(name)').eq('sale_id', id); if (ei) throw ei
    const itemIds=(items||[]).map((x:any)=>x.id)
    let returned:any[]=[]
    if(itemIds.length){const {data:ri,error:er}=await db.from('sale_return_items').select('sale_item_id,quantity').in('sale_item_id',itemIds);if(er)throw er;returned=ri||[]}
    const returnedMap=new Map<string,number>();for(const r of returned)returnedMap.set(r.sale_item_id,(returnedMap.get(r.sale_item_id)||0)+n(r.quantity))
    return json({ ...mapSale(data), items: (items || []).map((x: any) => ({ id:x.id, productId: x.product_id, productName: x.products?.name, quantity: n(x.quantity), returnedQuantity:returnedMap.get(x.id)||0, availableReturnQuantity:n(x.quantity)-(returnedMap.get(x.id)||0), unitPrice: n(x.unit_price), lineTotal: n(x.line_total) })) })
  }
  if (method === 'POST' && path === '/sales') {
    const b = await body(req)
    const driverPhone = normalizeDigits(String(b.driverPhone || '').trim())
    if(driverPhone&&!/^\d{11}$/.test(driverPhone))return fail('شماره تماس راننده باید ۱۱ رقم باشد')
    if(b.driverVehicle&& !/^\d{2} [آ-ی] \d{3} - \d{2}$/.test(normalizeDigits(String(b.driverVehicle)).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک')))return fail('فرمت پلاک ایران معتبر نیست')
    const { data, error } = await db.rpc('boostan_create_sale', { p_payload: {...b,driverPhone,driverVehicle: b.driverVehicle?normalizeDigits(String(b.driverVehicle)).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک'):null}, p_actor: user.id }); if (error) throw error
    return json(data, 201)
  }
  return null
}

async function payments(req: Request, path: string, method: string, user: AppUser) {
  manager(user)
  if (method === 'GET' && path === '/payments') {
    const { data, error } = await db.from('payments').select('id,customer_id,sale_id,amount,payment_method,paid_at,note,customers(name)').order('paid_at', { ascending: false }).limit(500); if (error) throw error
    return json((data || []).map((x: any) => ({ id: x.id, customerId: x.customer_id, customerName: x.customers?.name, saleId: x.sale_id, amount: n(x.amount), paymentMethod: x.payment_method, paidAt: x.paid_at, note: x.note })))
  }
  if (method === 'POST' && path === '/payments') {
    const b = await body(req)
    const { data, error } = await db.rpc('boostan_create_payment', { p_customer: b.customerId, p_amount: n(b.amount), p_method: String(b.paymentMethod || 'CASH'), p_actor: user.id, p_paid_at: new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  return null
}

async function inventory(req: Request, path: string, method: string, user: AppUser) {
  const movementId = path.match(/^\/inventory\/movement\/([0-9a-f-]+)$/i)?.[1]
  if (method === 'GET' && path === '/inventory') {
    const { data, error } = await db.from('v_inventory_stock').select('*').order('name'); if (error) throw error
    return json((data || []).map(x => ({ productId: x.product_id, code: x.code, name: x.name, unit: x.unit, price: n(x.price), minimumStock: n(x.minimum_stock), stock: n(x.stock), stockValue: n(x.stock) * n(x.price) })))
  }
  if (method === 'GET' && path === '/inventory/low-stock') {
    const { data, error } = await db.from('v_inventory_stock').select('*').order('name'); if (error) throw error
    return json((data || []).filter(x => n(x.stock) <= n(x.minimum_stock)).map(x => ({ productId: x.product_id, code: x.code, name: x.name, unit: x.unit, minimumStock: n(x.minimum_stock), stock: n(x.stock) })))
  }
  if (method === 'GET' && movementId) {
    const { data, error } = await db.from('inventory_transactions').select('id,product_id,transaction_type,quantity,reference_type,reference_id,occurred_at,note,users(full_name),products(name)').eq('product_id', movementId).order('occurred_at', { ascending: false }).limit(1000); if (error) throw error
    return json((data || []).map((x: any) => ({ id: x.id, productId: x.product_id, productName: x.products?.name, transactionType: x.transaction_type, quantity: n(x.quantity), referenceType: x.reference_type, referenceId: x.reference_id, occurredAt: x.occurred_at, note: x.note, operatorName: x.users?.full_name })))
  }
  if (method === 'POST' && path === '/inventory/adjustments') {
    manager(user); const b = await body(req)
    const { data, error } = await db.rpc('boostan_adjust_inventory', { p_product: b.productId, p_direction: b.direction, p_quantity: n(b.quantity), p_actor: user.id, p_at: new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  if (method === 'POST' && path === '/inventory/set-actual') {
    manager(user); const b = await body(req)
    if (!b.productId || b.actualStock === '' || b.actualStock == null || n(b.actualStock) < 0) return fail('موجودی واقعی معتبر نیست')
    const { data, error } = await db.rpc('boostan_set_inventory_actual', { p_product: b.productId, p_actual: n(b.actualStock), p_actor: user.id, p_note: String(b.note || '').trim() }); if (error) throw error
    return json(data, 201)
  }
  return null
}


async function materials(req: Request, path: string, method: string, user: AppUser) {
  manager(user)
  if (method === 'GET' && path === '/materials') {
    const {data,error}=await db.from('v_material_stock').select('*').order('material_type').order('name');if(error)throw error
    return json((data||[]).map(x=>({materialId:x.material_id,code:x.code,name:x.name,materialType:x.material_type,unit:x.unit,minimumStockKg:n(x.minimum_stock_kg),stockKg:n(x.stock_kg),isActive:x.is_active})))
  }
  const movementId=path.match(/^\/materials\/([0-9a-f-]+)\/movement$/i)?.[1]
  if(method==='GET'&&movementId){
    const {data,error}=await db.from('material_transactions').select('id,material_id,transaction_type,quantity_kg,unit_cost,reference_type,reference_id,occurred_at,note,users(full_name)').eq('material_id',movementId).order('occurred_at',{ascending:false}).limit(1000);if(error)throw error
    return json((data||[]).map((x:any)=>({id:x.id,materialId:x.material_id,transactionType:x.transaction_type,quantityKg:n(x.quantity_kg),unitCost:n(x.unit_cost),referenceType:x.reference_type,referenceId:x.reference_id,occurredAt:x.occurred_at,note:x.note,userName:x.users?.full_name||null})))
  }
  if(method==='POST'&&path==='/materials/set-actual'){
    const b=await body(req);if(!b.materialId||b.actualStockKg==null||n(b.actualStockKg)<0||!String(b.note||'').trim())return fail('موجودی واقعی و علت اصلاح الزامی است')
    const {data,error}=await db.rpc('boostan_set_material_actual',{p_material:b.materialId,p_actual:n(b.actualStockKg),p_actor:user.id,p_note:String(b.note).trim()});if(error)throw error
    return json(data,201)
  }
  return null
}


async function operations(req: Request, path: string, method: string, user: AppUser) {
  manager(user)
  if (method === 'GET' && path === '/purchases') {
    const { data, error } = await db.from('purchases').select('*').order('purchased_at', { ascending: false }).limit(500); if (error) throw error
    return json((data || []).map(x => ({ id:x.id,purchaseType:x.purchase_type,supplierName:x.supplier_name,itemName:x.item_name,productId:x.product_id,materialId:x.inventory_material_id,quantity:n(x.quantity),weightKg:n(x.weight_kg),unit:x.unit,unitPrice:n(x.unit_price),totalAmount:n(x.total_amount),purchasedAt:x.purchased_at,note:x.note })))
  }
  if (method === 'POST' && path === '/purchases') {
    const b=await body(req); const { data,error }=await db.rpc('boostan_create_purchase',{p_payload:b,p_actor:user.id}); if(error)throw error; return json(data,201)
  }
  if (method === 'GET' && path === '/grinding') {
    const { data,error }=await db.from('grinding_records').select('*').order('ground_at',{ascending:false}).limit(500);if(error)throw error
    return json((data||[]).map(x=>({id:x.id,bagCount:Number(x.bag_count||x.defective_count||0),bagWeightKg:n(x.bag_weight_kg||x.approx_weight_each),totalWeightKg:n(x.total_weight),costMode:x.cost_mode||'DAILY',dailyCost:n(x.daily_cost),costPerKg:n(x.cost_per_kg),totalCost:n(x.labor_cost),groundAt:x.ground_at,note:x.note})))
  }
  if (method === 'POST' && path === '/grinding') {
    const b=await body(req)
    const {data,error}=await db.rpc('boostan_create_grinding',{p_payload:b,p_actor:user.id});if(error)throw error
    return json(data,201)
  }
  if (method === 'GET' && path === '/expenses') {
    const {data,error}=await db.from('expenses').select('*').order('expense_date',{ascending:false}).limit(1000);if(error)throw error
    return json((data||[]).map(x=>({id:x.id,title:x.title,amount:n(x.amount),category:x.category,costType:x.cost_type,allocationMonths:x.allocation_months,expenseDate:x.expense_date,note:x.note})))
  }
  if (method === 'POST' && path === '/expenses') {
    const b=await body(req), amount=n(b.amount), costType=String(b.costType||'NORMAL').toUpperCase(), months=costType==='HEAVY'?Math.max(2,Math.trunc(n(b.allocationMonths))):1
    if(!String(b.title||'').trim()||amount<0||!['NORMAL','HEAVY'].includes(costType))return fail('اطلاعات هزینه معتبر نیست')
    const {data,error}=await db.from('expenses').insert({title:String(b.title).trim(),amount,category:String(b.category||'OTHER').toUpperCase(),cost_type:costType,allocation_months:months,expense_date:new Date().toISOString(),note:String(b.note||'').trim()||null,created_by:user.id}).select().single();if(error)throw error
    await db.from('activity_logs').insert({user_id:user.id,action:'CREATE_EXPENSE',entity_type:'EXPENSE',entity_id:data.id,details:{amount,costType,allocationMonths:months}})
    return json({id:data.id,title:data.title,amount:n(data.amount),category:data.category,costType:data.cost_type,allocationMonths:data.allocation_months,expenseDate:data.expense_date,note:data.note},201)
  }
  if (method === 'GET' && path === '/returns') {
    const {data,error}=await db.from('sale_returns').select('id,sale_id,return_type,amount_reduction,refund_amount,reason,note,returned_at,sales(customer_id,total_amount,customers(name))').order('returned_at',{ascending:false}).limit(500);if(error)throw error
    return json((data||[]).map((x:any)=>({id:x.id,saleId:x.sale_id,returnType:x.return_type,amountReduction:n(x.amount_reduction),refundAmount:n(x.refund_amount),reason:x.reason,note:x.note,returnedAt:x.returned_at,customerName:x.sales?.customers?.name||null,saleTotal:n(x.sales?.total_amount)})))
  }
  if (method === 'POST' && path === '/returns') {
    const b=await body(req); const {data,error}=await db.rpc('boostan_return_sale',{p_payload:b,p_actor:user.id});if(error)throw error;return json(data,201)
  }
  return null
}

function monthKey(iso:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'}).format(new Date(iso))}
function dateKey(iso:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso))}
function addMonthsKey(key:string,delta:number){const [y,m]=key.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}

async function financeSummary(user: AppUser, url: URL) {
  manager(user)
  const from=url.searchParams.get('from')||`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth()+1).padStart(2,'0')}-01`
  const to=url.searchParams.get('to')||new Date().toISOString().slice(0,10)
  const fromIso=`${from}T00:00:00+03:30`,toIso=`${to}T23:59:59+03:30`
  const [{data:prod,error:ep},{data:salesData,error:es},{data:purchases,error:epu},{data:expensesData,error:ee},{data:grind,error:eg},{data:productsData,error:epr}] = await Promise.all([
    db.from('v_production_summary').select('product_id,product_name,quantity,production_at,weight_kg').gte('production_at',fromIso).lte('production_at',toIso),
    db.from('v_sales_summary').select('id,total_amount,net_total,sold_at').gte('sold_at',fromIso).lte('sold_at',toIso),
    db.from('purchases').select('total_amount,purchased_at').lte('purchased_at',toIso),
    db.from('expenses').select('amount,cost_type,allocation_months,expense_date').lte('expense_date',toIso),
    db.from('grinding_records').select('labor_cost,ground_at').gte('ground_at',fromIso).lte('ground_at',toIso),
    db.from('products').select('id,name,weight_kg,price').eq('is_active',true).order('name'),
  ])
  if(ep||es||epu||ee||eg||epr)throw ep||es||epu||ee||eg||epr
  const firstMonth=monthKey(fromIso),lastMonth=monthKey(toIso)
  const inRangeMonth=(k:string)=>k>=firstMonth&&k<=lastMonth
  const purchaseCost=(purchases||[]).filter(x=>new Date(x.purchased_at)>=new Date(fromIso)&&new Date(x.purchased_at)<=new Date(toIso)).reduce((a,x)=>a+n(x.total_amount),0)
  let allocatedExpense=0
  for(const x of expensesData||[]){
    const start=monthKey(x.expense_date), months=x.cost_type==='HEAVY'?Math.max(1,Number(x.allocation_months||1)):1, part=n(x.amount)/months
    for(let i=0;i<months;i++){const k=addMonthsKey(start,i);if(inRangeMonth(k))allocatedExpense+=part}
  }
  const grindingCost=(grind||[]).reduce((a,x)=>a+n(x.labor_cost),0)
  const totalCost=purchaseCost+allocatedExpense+grindingCost
  const productionUnits=(prod||[]).reduce((a,x)=>a+n(x.quantity),0)
  const productionKg=(prod||[]).reduce((a:any,x:any)=>a+n(x.quantity)*n(x.weight_kg),0)
  const grossRevenue=(salesData||[]).reduce((a,x)=>a+n(x.total_amount),0)
  const revenue=(salesData||[]).reduce((a,x)=>a+n(x.net_total??x.total_amount),0)
  const avgCostPerUnit=productionUnits>0?totalCost/productionUnits:0
  const avgCostPerKg=productionKg>0?totalCost/productionKg:0
  const estimatedProductCosts=(productsData||[]).map(x=>({productId:x.id,productName:x.name,weightKg:n(x.weight_kg),salePrice:n(x.price),estimatedUnitCost:n(x.weight_kg)>0?avgCostPerKg*n(x.weight_kg):avgCostPerUnit,estimatedUnitMargin:n(x.price)-(n(x.weight_kg)>0?avgCostPerKg*n(x.weight_kg):avgCostPerUnit)}))
  const {data:materialsData,error:em}=await db.from('v_material_stock').select('*').order('name');if(em)throw em
  const {data:cashData,error:ec}=await db.from('financial_entries').select('direction,amount,cash_effect,occurred_at').eq('cash_effect',true).gte('occurred_at',fromIso).lte('occurred_at',toIso);if(ec)throw ec
  const cashIn=(cashData||[]).filter(x=>x.direction==='IN').reduce((a,x)=>a+n(x.amount),0),cashOut=(cashData||[]).filter(x=>x.direction==='OUT').reduce((a,x)=>a+n(x.amount),0)
  return json({from,to,productionUnits,productionKg,purchaseCost,allocatedExpense,grindingCost,totalCost,grossRevenue,revenue,estimatedProfit:revenue-totalCost,cashIn,cashOut,netCashFlow:cashIn-cashOut,avgCostPerUnit,avgCostPerKg,estimatedProductCosts,materials:(materialsData||[]).map(x=>({materialId:x.material_id,name:x.name,materialType:x.material_type,stockKg:n(x.stock_kg),minimumStockKg:n(x.minimum_stock_kg)}))})
}

async function currentStatus(user: AppUser) {
  manager(user)
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0)
  const [{data:inv,error:ei},{data:materialsData,error:em},{data:debts,error:ed},{data:salesData,error:es},{data:prod,error:ep},{data:fin,error:ef}] = await Promise.all([
    db.from('v_inventory_stock').select('*').order('name'),
    db.from('v_material_stock').select('*').order('name'),
    db.from('v_customer_balances').select('*').order('balance',{ascending:false}),
    db.from('v_sales_summary').select('subtotal,total_amount,net_total,sold_at').order('sold_at',{ascending:false}).limit(2000),
    db.from('v_production_summary').select('quantity,gross_quantity,defects,production_at').order('production_at',{ascending:false}).limit(2000),
    db.from('financial_entries').select('direction,amount,cash_effect,occurred_at').eq('cash_effect',true).gte('occurred_at',monthStart.toISOString()).limit(3000),
  ])
  if(ei||em||ed||es||ep||ef)throw ei||em||ed||es||ep||ef
  const today=dateKey(new Date().toISOString()),todaySales=(salesData||[]).filter(x=>dateKey(x.sold_at)===today),todayProd=(prod||[]).filter(x=>dateKey(x.production_at)===today)
  const gross=todaySales.reduce((a,x)=>a+n(x.subtotal),0),net=todaySales.reduce((a,x)=>a+n(x.net_total),0),grossProd=todayProd.reduce((a,x)=>a+n(x.gross_quantity),0),healthy=todayProd.reduce((a,x)=>a+n(x.quantity),0),defects=todayProd.reduce((a,x)=>a+n(x.defects),0)
  const raw=(materialsData||[]).find(x=>x.code==='RAW-READY'),scrap=(materialsData||[]).find(x=>x.code==='SCRAP-GRIND')
  const cashIn=(fin||[]).filter(x=>x.direction==='IN').reduce((a,x)=>a+n(x.amount),0),cashOut=(fin||[]).filter(x=>x.direction==='OUT').reduce((a,x)=>a+n(x.amount),0)
  return json({
    asOf:new Date().toISOString(),
    inventory:(inv||[]).map(x=>({productId:x.product_id,name:x.name,stock:n(x.stock),minimumStock:n(x.minimum_stock),price:n(x.price),stockValue:n(x.stock)*n(x.price)})),
    materials:(materialsData||[]).map(x=>({materialId:x.material_id,code:x.code,name:x.name,materialType:x.material_type,stockKg:n(x.stock_kg),minimumStockKg:n(x.minimum_stock_kg)})),
    rawMaterialReadyKg:n(raw?.stock_kg),grindableScrapKg:n(scrap?.stock_kg),
    totalReceivables:(debts||[]).reduce((a,x)=>a+Math.max(0,n(x.balance)),0),
    debtors:(debts||[]).filter(x=>n(x.balance)>0).map(x=>({customerId:x.customer_id,name:x.name,phone:x.phone,balance:n(x.balance)})),
    todayGrossSales:gross,todayNetSales:net,todaySales:net,todayGrossProduction:grossProd,todayProduction:healthy,todayDefects:defects,todayDefectRate:grossProd>0?defects/grossProd*100:0,
    monthCashIn:cashIn,monthCashOut:cashOut,monthNetCashFlow:cashIn-cashOut,
  })
}

async function users(req: Request, path: string, method: string, user: AppUser) {
  manager(user)
  if (method === 'GET' && path === '/users') {
    const { data, error } = await db.from('users').select('id,username,full_name,role,is_active,created_at').order('created_at', { ascending: false }); if (error) throw error
    return json((data || []).map(x => ({ id: x.id, username: x.username, fullName: x.full_name, role: x.role, isActive: x.is_active, createdAt: x.created_at })))
  }
  if (method === 'POST' && path === '/users') {
    const b = await body(req); const username = String(b.username || '').trim(), fullName = String(b.fullName || '').trim(), password = String(b.password || ''), role = b.role === 'MANAGER' ? 'MANAGER' : 'OPERATOR'
    if (username.length < 3 || fullName.length < 2 || password.length < 4) return fail('اطلاعات کاربر معتبر نیست')
    const hash = await bcrypt.hash(password, 10)
    const { data, error } = await db.from('users').insert({ username, full_name: fullName, password_hash: hash, role }).select('id,username,full_name,role,is_active,created_at').single(); if (error) throw error
    await db.from('activity_logs').insert({ user_id: user.id, action: 'CREATE_USER', entity_type: 'USER', entity_id: data.id, details: { username, role } })
    return json({ id: data.id, username: data.username, fullName: data.full_name, role: data.role, isActive: data.is_active, createdAt: data.created_at }, 201)
  }
  const id = path.match(/^\/users\/([0-9a-f-]+)\/active$/i)?.[1]
  if (method === 'PATCH' && id) {
    const b = await body(req); if (id === user.id && b.isActive === false) return fail('نمی‌توانید حساب مدیر فعلی را غیرفعال کنید')
    const { data, error } = await db.from('users').update({ is_active: !!b.isActive, updated_at: new Date().toISOString() }).eq('id', id).select('id,username,full_name,role,is_active').maybeSingle(); if (error) throw error
    if (!data) return fail('کاربر پیدا نشد', 404)
    return json({ id: data.id, username: data.username, fullName: data.full_name, role: data.role, isActive: data.is_active })
  }
  return null
}

async function dashboard(user: AppUser) {
  manager(user)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const todayTehran = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0)
  const [{data:prod,error:ep},{data:salesData,error:es},{data:inv,error:ei},{data:materialsData,error:em},{data:debt,error:ed},{data:acts,error:ea},{data:fin,error:ef}] = await Promise.all([
    db.from('v_production_summary').select('quantity,gross_quantity,defects,production_at').gte('production_at', since),
    db.from('v_sales_summary').select('subtotal,net_total,total_amount,sold_at').gte('sold_at', since),
    db.from('v_inventory_stock').select('*'),db.from('v_material_stock').select('*'),db.from('v_customer_balances').select('balance'),
    db.from('activity_logs').select('id,action,created_at,user_id,users(full_name)').order('created_at',{ascending:false}).limit(20),
    db.from('financial_entries').select('direction,amount,cash_effect,occurred_at').eq('cash_effect',true).gte('occurred_at',monthStart.toISOString()).limit(3000),
  ])
  if(ep||es||ei||em||ed||ea||ef)throw ep||es||ei||em||ed||ea||ef
  const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso))
  const prodSeries=new Map<string,number>(),saleSeries=new Map<string,number>();for(const x of prod||[])prodSeries.set(day(x.production_at),(prodSeries.get(day(x.production_at))||0)+n(x.quantity));for(const x of salesData||[])saleSeries.set(day(x.sold_at),(saleSeries.get(day(x.sold_at))||0)+n(x.net_total??x.total_amount))
  const todayProd=(prod||[]).filter(x=>day(x.production_at)===todayTehran),todaySalesRows=(salesData||[]).filter(x=>day(x.sold_at)===todayTehran),inventory=inv||[]
  const grossProduction=todayProd.reduce((s,x)=>s+n(x.gross_quantity),0),defects=todayProd.reduce((s,x)=>s+n(x.defects),0),raw=(materialsData||[]).find(x=>x.code==='RAW-READY'),scrap=(materialsData||[]).find(x=>x.code==='SCRAP-GRIND')
  const cashIn=(fin||[]).filter(x=>x.direction==='IN').reduce((a,x)=>a+n(x.amount),0),cashOut=(fin||[]).filter(x=>x.direction==='OUT').reduce((a,x)=>a+n(x.amount),0)
  return json({
    todayProduction:todayProd.reduce((s,x)=>s+n(x.quantity),0),todayGrossProduction:grossProduction,todayDefects:defects,todayDefectRate:grossProduction>0?defects/grossProduction*100:0,
    todayGrossSales:todaySalesRows.reduce((s,x)=>s+n(x.subtotal),0),todaySales:todaySalesRows.reduce((s,x)=>s+n(x.net_total??x.total_amount),0),
    rawMaterialReadyKg:n(raw?.stock_kg),grindableScrapKg:n(scrap?.stock_kg),inventoryProductCount:inventory.length,inventoryValue:inventory.reduce((s,x)=>s+n(x.stock)*n(x.price),0),
    customerDebt:(debt||[]).reduce((s,x)=>s+Math.max(0,n(x.balance)),0),lowStockCount:inventory.filter(x=>n(x.stock)<=n(x.minimum_stock)).length,
    monthCashIn:cashIn,monthCashOut:cashOut,monthNetCashFlow:cashIn-cashOut,
    productionSeries:[...prodSeries.entries()].map(([date,total])=>({date,total})).sort((a,b)=>a.date.localeCompare(b.date)),salesSeries:[...saleSeries.entries()].map(([date,total])=>({date,total})).sort((a,b)=>a.date.localeCompare(b.date)),
    recentActivities:(acts||[]).map((x:any)=>({id:x.id,action:x.action,createdAt:x.created_at,userName:x.users?.full_name||null})),
  })
}

function jalaliReportDate(key:string){
  if(/^\d{4}-\d{2}-\d{2}$/.test(key)) return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(`${key}T12:00:00+03:30`))
  if(/^\d{4}-\d{2}$/.test(key)) return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'}).format(new Date(`${key}-01T12:00:00+03:30`))
  return key
}

async function reports(path: string, user: AppUser, url: URL) {
  manager(user)
  const m = path.match(/^\/reports\/([^/]+)(?:\/export\/csv)?$/)
  if (!m) return null
  const type = m[1], from = url.searchParams.get('from'), to = url.searchParams.get('to')
  const fromIso = from ? `${from}T00:00:00+03:30` : new Date(Date.now() - 30 * 86400000).toISOString()
  const toIso = to ? `${to}T23:59:59+03:30` : new Date().toISOString()
  let rows: any[] = []
  if (type === 'production' || type === 'production-monthly' || type === 'operators') {
    const { data, error } = await db.from('v_production_summary').select('*').gte('production_at', fromIso).lte('production_at', toIso); if (error) throw error
    if (type === 'operators') {
      const g = new Map<string, any>(); for (const x of data || []) { const k=x.operator_id; const a=g.get(k)||{operator:x.operator_name,total:0,defects:0}; a.total+=n(x.quantity); a.defects+=n(x.defects); g.set(k,a) } rows=[...g.values()]
    } else {
      const monthly = type.endsWith('monthly'); const g=new Map<string,number>(); for(const x of data||[]){const d=new Date(x.production_at);const key=monthly?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'}).format(d):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);g.set(key,(g.get(key)||0)+n(x.quantity))} rows=[...g.entries()].map(([date,total])=>({date,total})).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
    }
  } else if (type === 'sales' || type === 'sales-monthly') {
    const { data,error }=await db.from('v_sales_summary').select('*').gte('sold_at',fromIso).lte('sold_at',toIso);if(error)throw error;const monthly=type.endsWith('monthly');const g=new Map<string,number>();for(const x of data||[]){const d=new Date(x.sold_at);const key=monthly?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'}).format(d):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);g.set(key,(g.get(key)||0)+n(x.net_total??x.total_amount))}rows=[...g.entries()].map(([date,total])=>({date,total})).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
  } else if (type === 'inventory') {
    const { data,error }=await db.from('v_inventory_stock').select('*').order('name');if(error)throw error;rows=(data||[]).map(x=>({product:x.name,stock:n(x.stock),minimumStock:n(x.minimum_stock),price:n(x.price),stockValue:n(x.stock)*n(x.price)}))
  } else if (type === 'debtors') {
    const { data,error }=await db.from('v_customer_balances').select('*').gt('balance',0).order('balance',{ascending:false});if(error)throw error;rows=(data||[]).map(x=>({customer:x.name,phone:x.phone,balance:n(x.balance)}))
  } else return fail('گزارش ناشناخته است',404)
  rows=rows.map(r=>Object.prototype.hasOwnProperty.call(r,'date')?{...r,date:jalaliReportDate(String(r.date))}:r)
  if (path.endsWith('/export/csv')) {
    const keys = rows[0] ? Object.keys(rows[0]) : []
    const esc=(v:any)=>`"${String(v??'').replaceAll('"','""')}"`
    const csv='\uFEFF'+[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\r\n')
    return new Response(csv,{status:200,headers:{...corsHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=${type}.csv`}})
  }
  return json(rows)
}


async function operationsLedger(user: AppUser, url: URL) {
  manager(user)
  const from=url.searchParams.get('from'),to=url.searchParams.get('to'),flow=(url.searchParams.get('flow')||'ALL').toUpperCase(),kind=(url.searchParams.get('kind')||'ALL').toUpperCase(),q=(url.searchParams.get('q')||'').trim().toLowerCase()
  const fromIso=from?`${from}T00:00:00+03:30`:new Date(Date.now()-180*86400000).toISOString(),toIso=to?`${to}T23:59:59+03:30`:new Date().toISOString()
  const entries:any[]=[]
  const push=(x:any)=>{const hay=`${x.type||''} ${x.title||''} ${x.detail||''} ${x.reason||''}`.toLowerCase();if((flow==='ALL'||x.flow===flow)&&(kind==='ALL'||x.type===kind)&&(!q||hay.includes(q)))entries.push(x)}
  const [prod,salesQ,pur,gr,exp,pay,ret,mat,fin,acts]=await Promise.all([
    db.from('v_production_summary').select('*').gte('production_at',fromIso).lte('production_at',toIso).limit(1000),
    db.from('v_sales_summary').select('*').gte('sold_at',fromIso).lte('sold_at',toIso).limit(1000),
    db.from('purchases').select('*').gte('purchased_at',fromIso).lte('purchased_at',toIso).limit(1000),
    db.from('grinding_records').select('*').gte('ground_at',fromIso).lte('ground_at',toIso).limit(1000),
    db.from('expenses').select('*').gte('expense_date',fromIso).lte('expense_date',toIso).limit(1000),
    db.from('payments').select('*,customers(name)').gte('paid_at',fromIso).lte('paid_at',toIso).limit(1000),
    db.from('sale_returns').select('*').gte('returned_at',fromIso).lte('returned_at',toIso).limit(1000),
    db.from('material_transactions').select('*,material_items(name)').gte('occurred_at',fromIso).lte('occurred_at',toIso).limit(1500),
    db.from('financial_entries').select('*').gte('occurred_at',fromIso).lte('occurred_at',toIso).limit(1500),
    db.from('activity_logs').select('*,users(full_name)').gte('created_at',fromIso).lte('created_at',toIso).limit(1000),
  ])
  for(const r of [prod,salesQ,pur,gr,exp,pay,ret,mat,fin,acts])if(r.error)throw r.error
  for(const x of prod.data||[])push({id:`P-${x.id}`,flow:'MATERIAL',type:'PRODUCTION',title:'تولید',detail:`${x.product_name}: سالم ${n(x.quantity)} / ناخالص ${n(x.gross_quantity)} / معیوب ${n(x.defects)}`,amount:null,quantity:n(x.quantity),occurredAt:x.production_at,reason:x.note||''})
  for(const x of salesQ.data||[])push({id:`S-${x.id}`,flow:'FINANCIAL',type:'SALE',title:'فروش',detail:`${x.customer_name||'فروش غیرنسیه'} — اپراتور ${x.operator_name||'-'}`,amount:n(x.net_total),quantity:null,occurredAt:x.sold_at,reason:x.status||''})
  for(const x of pur.data||[])push({id:`B-${x.id}`,flow:'MATERIAL',type:'PURCHASE',title:'خرید',detail:`${x.item_name} — ${x.supplier_name||'-'} — ${n(x.weight_kg)} kg`,amount:n(x.total_amount),quantity:n(x.weight_kg||x.quantity),occurredAt:x.purchased_at,reason:x.note||''})
  for(const x of gr.data||[])push({id:`G-${x.id}`,flow:'MATERIAL',type:'GRINDING',title:'آسیاب',detail:`${Number(x.bag_count||0)} گونی × ${n(x.bag_weight_kg)} kg = ${n(x.total_weight)} kg`,amount:n(x.labor_cost),quantity:n(x.total_weight),occurredAt:x.ground_at,reason:x.note||''})
  for(const x of exp.data||[])push({id:`E-${x.id}`,flow:'FINANCIAL',type:'EXPENSE',title:'هزینه کارخانه',detail:x.title,amount:n(x.amount),quantity:null,occurredAt:x.expense_date,reason:x.note||''})
  for(const x of pay.data||[])push({id:`R-${x.id}`,flow:'FINANCIAL',type:'RECEIPT',title:'وصول مطالبات',detail:(x as any).customers?.name||'',amount:n(x.amount),quantity:null,occurredAt:x.paid_at,reason:x.note||''})
  for(const x of ret.data||[])push({id:`X-${x.id}`,flow:'FINANCIAL',type:'RETURN',title:'مرجوعی/ابطال',detail:x.return_type,amount:n(x.amount_reduction),quantity:null,occurredAt:x.returned_at,reason:x.reason||''})
  for(const x of mat.data||[])push({id:`M-${x.id}`,flow:'MATERIAL',type:x.transaction_type,title:'گردش مواد',detail:`${(x as any).material_items?.name||''}: ${n(x.quantity_kg)} kg`,amount:null,quantity:n(x.quantity_kg),occurredAt:x.occurred_at,reason:x.note||''})
  for(const x of fin.data||[])push({id:`F-${x.id}`,flow:'FINANCIAL',type:x.entry_kind,title:x.direction==='IN'?'ورودی مالی':'خروجی مالی',detail:x.description||x.source_type,amount:n(x.amount),quantity:null,occurredAt:x.occurred_at,reason:x.cash_effect?'اثر نقدی':'تعهدی'})
  for(const x of acts.data||[])push({id:`I-${x.id}`,flow:'INFORMATION',type:x.action,title:'رویداد اطلاعاتی',detail:`${(x as any).users?.full_name||'-'} — ${x.entity_type}`,amount:null,quantity:null,occurredAt:x.created_at,reason:x.details?JSON.stringify(x.details):''})
  entries.sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime())
  return json(entries.slice(0,2500))
}

async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url), path = normalizePath(url.pathname), method = req.method.toUpperCase()
  if (method === 'GET' && path === '/health') {
    const { error } = await db.from('factory_settings').select('key').limit(1)
    return error ? fail('ارتباط با پایگاه داده برقرار نشد', 503, error.message) : json({ project: 'سامانه مدیریت کارخانه بوستان', version: '2.3-cloud', status: 'فعال', database: 'متصل', time: new Date().toISOString() })
  }
  if (method === 'POST' && path === '/auth/login') return login(req)

  const user = await authUser(req)
  if (method === 'GET' && path === '/auth/me') return json(user)
  if (method === 'GET' && path === '/dashboard') return dashboard(user)
  if (method === 'GET' && path === '/current-status') return currentStatus(user)
  if (method === 'GET' && path === '/finance/summary') return financeSummary(user,url)
  if (method === 'GET' && path === '/operations-ledger') return operationsLedger(user,url)

  const handlers = [products, customers]
  for (const h of handlers) { const r = await h(req, path, method, user, url); if (r) return r }
  for (const h of [production, sales, payments, inventory, materials, operations, users]) { const r = await h(req, path, method, user); if (r) return r }
  const rr = await reports(path, user, url); if (rr) return rr
  if (method === 'GET' && path === '/activity') {
    manager(user); const { data,error }=await db.from('activity_logs').select('id,action,entity_type,entity_id,details,created_at,users(full_name)').order('created_at',{ascending:false}).limit(500);if(error)throw error;return json((data||[]).map((x:any)=>({id:x.id,action:x.action,entityType:x.entity_type,entityId:x.entity_id,details:x.details,createdAt:x.created_at,userName:x.users?.full_name||null})))
  }
  return fail('مسیر API پیدا نشد', 404)
}

export default {
  fetch: async (req: Request) => {
    try { return await handler(req) }
    catch (e: any) {
      console.error(e)
      const raw = String(e?.message || 'خطای غیرمنتظره در سرور'); const translations:any={ 'Authentication required':'برای ادامه وارد حساب کاربری شوید','Session expired or invalid':'نشست شما منقضی شده است؛ دوباره وارد شوید','User is inactive':'حساب کاربری غیرفعال است','Manager access required':'این بخش فقط برای مدیر قابل دسترسی است','Insufficient stock':'موجودی ثبت‌شده کافی نیست','Grindable scrap stock is insufficient. Correct material inventory first.':'موجودی ثبت‌شده ضایعات کافی نیست'}; const msg = translations[raw] || raw
      const status = Number(e?.status || (msg.toLowerCase().includes('duplicate') ? 409 : 400))
      return fail(msg, status)
    }
  },
}
