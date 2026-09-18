-- Boostan Factory ERP v2 foundation
-- Phase 1: Factory master data redesign

BEGIN;

CREATE TABLE IF NOT EXISTS product_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    price numeric(18,2) NOT NULL CHECK(price >= 0),
    valid_from timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS operators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id),
    name varchar(150) NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(50) NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    transaction_type varchar(50) NOT NULL,
    quantity numeric(18,3) NOT NULL,
    reference_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(200) NOT NULL,
    phone varchar(50),
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(200) NOT NULL,
    amount numeric(18,2) NOT NULL CHECK(amount >= 0),
    expense_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_settings (
    key varchar(100) PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz DEFAULT now()
);

COMMIT;
