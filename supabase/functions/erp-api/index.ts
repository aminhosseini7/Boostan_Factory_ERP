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

function n(v: any) { return Number(v || 0) }

function mapProduct(x: any) {
  return { id: x.id, code: x.code, name: x.name, unit: x.unit, price: n(x.price), minimumStock: n(x.minimum_stock), isActive: x.is_active, createdAt: x.created_at, updatedAt: x.updated_at }
}
function mapCustomer(x: any) {
  return { id: x.id, name: x.name, phone: x.phone, address: x.address, isActive: x.is_active, createdAt: x.created_at }
}
function mapSale(x: any) {
  return { id: x.id, customerId: x.customer_id, customerName: x.customer_name, operatorId: x.operator_id, operatorName: x.operator_name, enteredBy: x.entered_by, enteredByName: x.entered_by_name, subtotal: n(x.subtotal), discountAmount: n(x.discount_amount), totalAmount: n(x.total_amount), paymentType: x.payment_type, paymentAmount: n(x.payment_amount), note: x.note, soldAt: x.sold_at }
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
    const price = n(b.price), opening = n(b.openingStock), minimum = n(b.minimumStock)
    if (!String(b.name || '').trim() || !String(b.unit || '').trim() || price < 0 || minimum < 0 || opening < 0) return fail('اطلاعات محصول معتبر نیست')
    const { data, error } = await db.from('products').insert({ code: b.code || null, name: String(b.name).trim(), unit: String(b.unit).trim(), price, minimum_stock: minimum }).select().single(); if (error) throw error
    await db.from('product_prices').insert({ product_id: data.id, price, valid_from: new Date().toISOString(), created_by: user.id })
    if (opening > 0) await db.from('inventory_transactions').insert({ product_id: data.id, transaction_type: 'OPENING', quantity: opening, reference_type: 'PRODUCT', operator_id: user.id, note: 'Opening stock' })
    await db.from('activity_logs').insert({ user_id: user.id, action: 'CREATE_PRODUCT', entity_type: 'PRODUCT', entity_id: data.id, details: { name: data.name } })
    return json(mapProduct(data), 201)
  }
  if (method === 'PUT' && id) {
    manager(user); const b = await body(req)
    const { data: old, error: e0 } = await db.from('products').select('*').eq('id', id).maybeSingle(); if (e0) throw e0
    if (!old) return fail('محصول پیدا نشد', 404)
    const price = n(b.price), minimum = n(b.minimumStock)
    const { data, error } = await db.from('products').update({ code: b.code || null, name: String(b.name || '').trim(), unit: String(b.unit || '').trim(), price, minimum_stock: minimum, updated_at: new Date().toISOString() }).eq('id', id).select().single(); if (error) throw error
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
      db.from('sales').select('id,total_amount,payment_type,payment_amount,sold_at').eq('customer_id', statementId).order('sold_at', { ascending: false }),
      db.from('payments').select('id,sale_id,amount,payment_method,paid_at,note').eq('customer_id', statementId).order('paid_at', { ascending: false }),
      db.from('v_customer_balances').select('balance').eq('customer_id', statementId).maybeSingle(),
    ])
    if (ec || es || ep || eb) throw ec || es || ep || eb
    if (!customer) return fail('مشتری پیدا نشد', 404)
    return json({ customer: mapCustomer(customer), sales: (sales || []).map(x => ({ id: x.id, totalAmount: n(x.total_amount), paymentType: x.payment_type, paymentAmount: n(x.payment_amount), soldAt: x.sold_at })), payments: (pays || []).map(x => ({ id: x.id, saleId: x.sale_id, amount: n(x.amount), paymentMethod: x.payment_method, paidAt: x.paid_at, note: x.note })), balance: n(bal?.balance) })
  }
  if (method === 'GET' && id) {
    const { data, error } = await db.from('customers').select('*').eq('id', id).maybeSingle(); if (error) throw error
    if (!data) return fail('مشتری پیدا نشد', 404)
    return json(mapCustomer(data))
  }
  if (method === 'POST' && path === '/customers') {
    const b = await body(req); const name = String(b.name || '').trim(); if (!name) return fail('نام مشتری الزامی است')
    const phone = String(b.phone || '').trim() || null
    const { data, error } = await db.from('customers').insert({ name, phone, address: String(b.address || '').trim() || null }).select().single(); if (error) throw error
    await db.from('activity_logs').insert({ user_id: user.id, action: 'CREATE_CUSTOMER', entity_type: 'CUSTOMER', entity_id: data.id, details: { name } })
    return json(mapCustomer(data), 201)
  }
  if (method === 'PUT' && id) {
    manager(user); const b = await body(req)
    const { data, error } = await db.from('customers').update({ name: String(b.name || '').trim(), phone: String(b.phone || '').trim() || null, address: String(b.address || '').trim() || null, updated_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(); if (error) throw error
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
    const { data, error } = await db.rpc('boostan_start_shift', { p_actor: user.id, p_product: b.productId, p_counter: n(b.counterStart), p_at: b.at || new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  if (method === 'POST' && path === '/production/end') {
    const b = await body(req)
    if (b.defects === '' || b.defects == null || n(b.defects) < 0) return fail('تعداد معیوب معتبر نیست')
    const { data, error } = await db.rpc('boostan_end_shift', { p_actor: user.id, p_defects: n(b.defects), p_at: b.at || new Date().toISOString(), p_note: b.note || null }); if (error) throw error
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
    const { data: items, error: ei } = await db.from('sale_items').select('product_id,quantity,unit_price,line_total,products(name)').eq('sale_id', id); if (ei) throw ei
    return json({ ...mapSale(data), items: (items || []).map((x: any) => ({ productId: x.product_id, productName: x.products?.name, quantity: n(x.quantity), unitPrice: n(x.unit_price), lineTotal: n(x.line_total) })) })
  }
  if (method === 'POST' && path === '/sales') {
    const b = await body(req)
    const { data, error } = await db.rpc('boostan_create_sale', { p_payload: b, p_actor: user.id }); if (error) throw error
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
    const { data, error } = await db.rpc('boostan_create_payment', { p_customer: b.customerId, p_amount: n(b.amount), p_method: String(b.paymentMethod || 'CASH'), p_actor: user.id, p_paid_at: b.paidAt || new Date().toISOString(), p_note: b.note || null }); if (error) throw error
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
    const { data, error } = await db.rpc('boostan_adjust_inventory', { p_product: b.productId, p_direction: b.direction, p_quantity: n(b.quantity), p_actor: user.id, p_at: b.occurredAt || new Date().toISOString(), p_note: b.note || null }); if (error) throw error
    return json(data, 201)
  }
  return null
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
  const [{ data: prod, error: ep }, { data: salesData, error: es }, { data: inv, error: ei }, { data: debt, error: ed }, { data: acts, error: ea }] = await Promise.all([
    db.from('v_production_summary').select('quantity,production_at').gte('production_at', since),
    db.from('v_sales_summary').select('total_amount,sold_at').gte('sold_at', since),
    db.from('v_inventory_stock').select('*'),
    db.from('v_customer_balances').select('balance'),
    db.from('activity_logs').select('id,action,created_at,user_id,users(full_name)').order('created_at', { ascending: false }).limit(20),
  ])
  if (ep || es || ei || ed || ea) throw ep || es || ei || ed || ea
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const prodSeries = new Map<string, number>(), saleSeries = new Map<string, number>()
  for (const x of prod || []) prodSeries.set(day(x.production_at), (prodSeries.get(day(x.production_at)) || 0) + n(x.quantity))
  for (const x of salesData || []) saleSeries.set(day(x.sold_at), (saleSeries.get(day(x.sold_at)) || 0) + n(x.total_amount))
  const inventory = inv || []
  return json({
    todayProduction: (prod || []).filter(x => day(x.production_at) === todayTehran).reduce((s, x) => s + n(x.quantity), 0),
    todaySales: (salesData || []).filter(x => day(x.sold_at) === todayTehran).reduce((s, x) => s + n(x.total_amount), 0),
    inventoryProductCount: inventory.length,
    inventoryValue: inventory.reduce((s, x) => s + n(x.stock) * n(x.price), 0),
    customerDebt: (debt || []).reduce((s, x) => s + Math.max(0, n(x.balance)), 0),
    lowStockCount: inventory.filter(x => n(x.stock) <= n(x.minimum_stock)).length,
    productionSeries: [...prodSeries.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
    salesSeries: [...saleSeries.entries()].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
    recentActivities: (acts || []).map((x: any) => ({ id: x.id, action: x.action, createdAt: x.created_at, userName: x.users?.full_name || null })),
  })
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
    const { data,error }=await db.from('v_sales_summary').select('*').gte('sold_at',fromIso).lte('sold_at',toIso);if(error)throw error;const monthly=type.endsWith('monthly');const g=new Map<string,number>();for(const x of data||[]){const d=new Date(x.sold_at);const key=monthly?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'}).format(d):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);g.set(key,(g.get(key)||0)+n(x.total_amount))}rows=[...g.entries()].map(([date,total])=>({date,total})).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
  } else if (type === 'inventory') {
    const { data,error }=await db.from('v_inventory_stock').select('*').order('name');if(error)throw error;rows=(data||[]).map(x=>({product:x.name,stock:n(x.stock),minimumStock:n(x.minimum_stock),price:n(x.price),stockValue:n(x.stock)*n(x.price)}))
  } else if (type === 'debtors') {
    const { data,error }=await db.from('v_customer_balances').select('*').gt('balance',0).order('balance',{ascending:false});if(error)throw error;rows=(data||[]).map(x=>({customer:x.name,phone:x.phone,balance:n(x.balance)}))
  } else return fail('گزارش ناشناخته است',404)
  if (path.endsWith('/export/csv')) {
    const keys = rows[0] ? Object.keys(rows[0]) : []
    const esc=(v:any)=>`"${String(v??'').replaceAll('"','""')}"`
    const csv='\uFEFF'+[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\r\n')
    return new Response(csv,{status:200,headers:{...corsHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=${type}.csv`}})
  }
  return json(rows)
}

async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url), path = normalizePath(url.pathname), method = req.method.toUpperCase()
  if (method === 'GET' && path === '/health') {
    const { error } = await db.from('factory_settings').select('key').limit(1)
    return error ? fail('Database connection failed', 503, error.message) : json({ project: 'Boostan Factory ERP', version: '2.0-cloud', status: 'running', database: 'connected', time: new Date().toISOString() })
  }
  if (method === 'POST' && path === '/auth/login') return login(req)

  const user = await authUser(req)
  if (method === 'GET' && path === '/auth/me') return json(user)
  if (method === 'GET' && path === '/dashboard') return dashboard(user)

  const handlers = [products, customers]
  for (const h of handlers) { const r = await h(req, path, method, user, url); if (r) return r }
  for (const h of [production, sales, payments, inventory, users]) { const r = await h(req, path, method, user); if (r) return r }
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
      const msg = String(e?.message || 'Unexpected server error')
      const status = Number(e?.status || (msg.toLowerCase().includes('duplicate') ? 409 : 400))
      return fail(msg, status)
    }
  },
}
