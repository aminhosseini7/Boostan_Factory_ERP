-- Boostan ERP
-- 202609230006_create_final_product_cost_view.sql
-- Creates the API target view using existing verified costing views.

BEGIN;

CREATE OR REPLACE VIEW v_final_product_standard_cost AS
WITH material AS (
    SELECT
        product_id,
        material_cost_kg,
        raw_ready_pct,
        scrap_grind_pct
    FROM v_standard_material_weighted_cost
),
grind AS (
    SELECT
        grinding_cost_per_kg
    FROM v_final_grinding_cost
    LIMIT 1
)
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.weight_kg,

    COALESCE(
        p.weight_kg * material.material_cost_kg,
        0
    ) AS material_cost,

    0::numeric AS production_cost,

    0::numeric AS overhead_cost,

    COALESCE(
        p.weight_kg * material.material_cost_kg,
        0
    ) AS base_cost,

    COALESCE(
        p.weight_kg * material.material_cost_kg,
        0
    ) AS final_unit_cost,

    CASE
        WHEN 0.80 > 0
        THEN
            COALESCE(
                p.weight_kg * material.material_cost_kg,
                0
            ) / 0.80
        ELSE 0
    END AS suggested_sale_price,

    COALESCE(material.raw_ready_pct,0) AS raw_ready_pct,
    COALESCE(material.scrap_grind_pct,0) AS scrap_grind_pct,
    COALESCE(grind.grinding_cost_per_kg,0) AS grinding_cost_per_kg

FROM products p
LEFT JOIN material
    ON material.product_id = p.id
CROSS JOIN grind;

COMMIT;
