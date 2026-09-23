-- Boostan ERP
-- 202609230008_fix_material_cost_to_last_purchase.sql
-- Fix: use latest RAW_MATERIAL purchase price instead of weighted average.

BEGIN;

DROP VIEW IF EXISTS v_standard_material_cost CASCADE;

CREATE VIEW v_standard_material_cost AS

WITH raw_latest AS (
    SELECT
        (p.total_amount / NULLIF(p.weight_kg, 0)) AS raw_ready_cost
    FROM purchases p
    WHERE p.purchase_type = 'RAW_MATERIAL'
      AND p.weight_kg > 0
    ORDER BY
        p.purchased_at DESC,
        p.created_at DESC
    LIMIT 1
),

scrap_purchase AS (
    SELECT
        COALESCE(SUM(purchases.total_amount),0) AS total,
        COALESCE(SUM(purchases.weight_kg),0) AS kg
    FROM purchases
    WHERE purchases.purchase_type = 'USED_SCRAP'
),

grind AS (
    SELECT
        COALESCE(SUM(grinding_records.labor_cost),0) AS total,
        COALESCE(SUM(grinding_records.total_weight),0) AS kg
    FROM grinding_records
)

SELECT
    COALESCE(raw_latest.raw_ready_cost,0) AS raw_ready_cost,

    CASE
        WHEN (scrap_purchase.kg + grind.kg) > 0
        THEN (scrap_purchase.total + grind.total)
             /
             (scrap_purchase.kg + grind.kg)
        ELSE 0
    END AS scrap_grind_cost

FROM raw_latest
CROSS JOIN scrap_purchase
CROSS JOIN grind;

COMMIT;
