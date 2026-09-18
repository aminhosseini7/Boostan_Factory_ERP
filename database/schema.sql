BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(80) UNIQUE NOT NULL,
  full_name varchar(150) NOT NULL,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('MANAGER','OPERATOR')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) UNIQUE,
  name varchar(200) NOT NULL,
  unit varchar(50) NOT NULL,
  price numeric(18,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  minimum_stock numeric(18,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  phone varchar(50),
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  shift varchar(20) NOT NULL CHECK (shift IN ('MORNING','EVENING','NIGHT')),
  production_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  operator_id uuid NOT NULL REFERENCES users(id),
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total_amount numeric(18,2) NOT NULL CHECK (total_amount >= 0),
  payment_type varchar(20) NOT NULL CHECK (payment_type IN ('CASH','CARD','CREDIT','MIXED')),
  payment_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
  note text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  payment_method varchar(50) NOT NULL,
  operator_id uuid REFERENCES users(id),
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  transaction_type varchar(30) NOT NULL CHECK (transaction_type IN ('OPENING','PRODUCTION','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  reference_type varchar(50),
  reference_id uuid,
  operator_id uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(50),
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_production_product_date ON production_records(product_id, production_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_operator_date ON production_records(operator_id, production_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON sales(customer_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_operator_date ON sales(operator_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_transactions(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

CREATE OR REPLACE VIEW v_inventory_stock AS
SELECT p.id AS product_id,p.code,p.name,p.unit,p.price,p.minimum_stock,
       COALESCE(SUM(CASE
         WHEN it.transaction_type IN ('OPENING','PRODUCTION','ADJUSTMENT_IN') THEN it.quantity
         WHEN it.transaction_type IN ('SALE','ADJUSTMENT_OUT') THEN -it.quantity
         ELSE 0 END),0)::numeric AS stock
FROM products p
LEFT JOIN inventory_transactions it ON it.product_id=p.id
WHERE p.is_active=true
GROUP BY p.id,p.code,p.name,p.unit,p.price,p.minimum_stock;

CREATE OR REPLACE VIEW v_customer_balances AS
SELECT c.id AS customer_id,c.name,c.phone,
       COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id=c.id),0)::numeric AS sales_total,
       COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id),0)::numeric AS payments_total,
       (COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id=c.id),0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id),0))::numeric AS balance
FROM customers c
WHERE c.is_active=true;
COMMIT;
