-- Boostan Factory | ONE-TIME manual test-data reset. DO NOT put this in supabase/migrations.
-- RUN ONLY AFTER exporting and checking a backup, and after stopping all user entries.
-- Intent: preserve products (IDs, codes, names, units, weights, CURRENT price), users,
-- assigned shifts, factory configuration, and two standard material categories.
-- Result: ZERO production/sales/credit/financial/movement/inventory/expense/activity data.
-- Historical product-price entries are reset to one CURRENT price per product.
-- This script is NOT automatically executed by GitHub Actions or deploy-supabase.bat.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products) THEN
    RAISE EXCEPTION 'No products found. Verify project before clearing test data';
  END IF;
  IF (SELECT count(*) FROM public.users WHERE is_active) < 1 THEN
    RAISE EXCEPTION 'No active users found. Verify project before clearing test data';
  END IF;
END;
$guard$;

-- Removing both FK sides in ONE statement means no CASCADE / product deletion.
TRUNCATE TABLE
  public.sale_return_items,
  public.sale_returns,
  public.payments,
  public.sale_items,
  public.sales,
  public.inventory_transactions,
  public.production_records,
  public.shift_runs,
  public.grinding_records,
  public.purchases,
  public.expenses,
  public.financial_entries,
  public.material_transactions,
  public.activity_logs,
  public.customers,
  public.suppliers;

-- Keep basket definitions with their current price; discard trial price changes/history.
DELETE FROM public.product_prices;
INSERT INTO public.product_prices (product_id, price, valid_from, created_by)
SELECT id, price, now(), NULL FROM public.products;

-- Keep the two application-required material categories; remove trial material definitions.
DELETE FROM public.material_items WHERE code NOT IN ('RAW-READY','SCRAP-GRIND');

-- Post-condition assertions. If any fails, the whole transaction rolls back.
DO $verify$
DECLARE v_products int; v_price_products int;
BEGIN
  SELECT count(*) INTO v_products FROM public.products;
  SELECT count(DISTINCT product_id) INTO v_price_products FROM public.product_prices;
  IF v_products<>v_price_products THEN
    RAISE EXCEPTION 'Product/price preservation check failed (% vs %)',v_products,v_price_products;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.shift_runs UNION ALL
    SELECT 1 FROM public.sales UNION ALL
    SELECT 1 FROM public.production_records UNION ALL
    SELECT 1 FROM public.inventory_transactions UNION ALL
    SELECT 1 FROM public.material_transactions UNION ALL
    SELECT 1 FROM public.financial_entries UNION ALL
    SELECT 1 FROM public.customers UNION ALL
    SELECT 1 FROM public.purchases UNION ALL
    SELECT 1 FROM public.grinding_records UNION ALL
    SELECT 1 FROM public.expenses
  ) THEN RAISE EXCEPTION 'Test rows remain; rollback required'; END IF;
END;
$verify$;

COMMIT;

-- Only definitions/configuration should remain; no historical stock balances or debt.
SELECT id, code, name, unit, price, weight_kg, is_active FROM public.products ORDER BY name;
SELECT 'sales' as item,count(*) as rows FROM public.sales
UNION ALL SELECT 'customers',count(*) FROM public.customers
UNION ALL SELECT 'inventory_transactions',count(*) FROM public.inventory_transactions
UNION ALL SELECT 'material_transactions',count(*) FROM public.material_transactions
UNION ALL SELECT 'production_records',count(*) FROM public.production_records
UNION ALL SELECT 'financial_entries',count(*) FROM public.financial_entries;
