-- Boostan ERP
-- 202609230010_seed_product_material_mix.sql
-- Initialize product material composition.
-- Current factory state: 100% raw material, 0% recycled/grind material.

BEGIN;

INSERT INTO product_material_mix (
    product_id,
    raw_ready_pct,
    scrap_grind_pct
)
SELECT
    p.id,
    100,
    0
FROM products p
WHERE NOT EXISTS (
    SELECT 1
    FROM product_material_mix pm
    WHERE pm.product_id = p.id
);

COMMIT;
