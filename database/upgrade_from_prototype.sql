-- Upgrade the early prototype database without deleting existing data.
-- Back up your Supabase database first.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name varchar(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE users SET full_name=COALESCE(full_name,username) WHERE full_name IS NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS code varchar(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_stock numeric(18,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS price numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE production_records ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES users(id);
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS shift varchar(20);
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS production_at timestamptz;
UPDATE production_records SET production_at=COALESCE(production_at,created_at,now()) WHERE production_at IS NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_amount numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_at timestamptz;
UPDATE sales SET sold_at=COALESCE(sold_at,created_at,now()),subtotal=COALESCE(NULLIF(subtotal,0),total_amount,0) WHERE sold_at IS NULL OR subtotal=0;

CREATE TABLE IF NOT EXISTS sale_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES products(id), quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK(unit_price>=0)
);

CREATE TABLE IF NOT EXISTS payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES customers(id), sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0), payment_method varchar(50) NOT NULL DEFAULT 'OTHER', operator_id uuid REFERENCES users(id),
 paid_at timestamptz NOT NULL DEFAULT now(), note text, created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='type')
    AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='inventory_transactions' AND column_name='transaction_type') THEN
   ALTER TABLE inventory_transactions RENAME COLUMN type TO transaction_type;
 END IF;
END $$;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS transaction_type varchar(30);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS reference_type varchar(50);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS reference_id uuid;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES users(id);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS note text;
UPDATE inventory_transactions SET occurred_at=COALESCE(occurred_at,created_at,now()) WHERE occurred_at IS NULL;
UPDATE inventory_transactions SET transaction_type=CASE WHEN transaction_type IN ('IN','PRODUCTION') THEN 'PRODUCTION' WHEN transaction_type IN ('OUT','SALE') THEN 'SALE' ELSE transaction_type END;


-- Bring optional tables created by intermediate prototypes up to the final shape.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_price numeric(18,2);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='sale_items' AND column_name='price') THEN
   UPDATE sale_items SET unit_price=COALESCE(unit_price,price) WHERE unit_price IS NULL;
 END IF;
END $$;
UPDATE sale_items SET unit_price=0 WHERE unit_price IS NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method varchar(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS note text;
UPDATE payments SET payment_method=COALESCE(payment_method,'OTHER'),paid_at=COALESCE(paid_at,created_at,now()) WHERE payment_method IS NULL OR paid_at IS NULL;

CREATE TABLE IF NOT EXISTS activity_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action varchar(100) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_type varchar(50);
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_code_nonnull ON products(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_production_product_date ON production_records(product_id,production_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON sales(customer_id,sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_transactions(product_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id,paid_at DESC);

CREATE OR REPLACE VIEW v_inventory_stock AS
SELECT p.id AS product_id,p.code,p.name,p.unit,p.price,p.minimum_stock,
COALESCE(SUM(CASE WHEN it.transaction_type IN ('OPENING','PRODUCTION','ADJUSTMENT_IN') THEN it.quantity WHEN it.transaction_type IN ('SALE','ADJUSTMENT_OUT') THEN -it.quantity ELSE 0 END),0)::numeric AS stock
FROM products p LEFT JOIN inventory_transactions it ON it.product_id=p.id WHERE p.is_active=true GROUP BY p.id,p.code,p.name,p.unit,p.price,p.minimum_stock;
CREATE OR REPLACE VIEW v_customer_balances AS
SELECT c.id customer_id,c.name,c.phone,
COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id=c.id),0)::numeric sales_total,
COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id),0)::numeric payments_total,
(COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id=c.id),0)-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.customer_id=c.id),0))::numeric balance
FROM customers c WHERE c.is_active=true;
COMMIT;
