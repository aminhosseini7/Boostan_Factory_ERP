-- Boostan ERP
-- 202609230007_complete_final_product_cost_engine.sql
-- Final corrected version
-- Recreates the view because PostgreSQL cannot change existing view columns with CREATE OR REPLACE VIEW.

BEGIN;

DROP VIEW IF EXISTS v_final_product_standard_cost CASCADE;

CREATE VIEW v_final_product_standard_cost AS

WITH material AS (
    SELECT
        product_id,
        material_cost_kg,
        raw_ready_pct,
        scrap_grind_pct
    FROM v_standard_material_weighted_cost
),

grinding AS (
    SELECT
        grinding_cost_per_kg
    FROM v_final_grinding_cost
    LIMIT 1
),

factory_rate AS (
    SELECT
        production_cost_per_minute
    FROM v_standard_factory_rates
    LIMIT 1
),

overhead AS (
    SELECT
        COALESCE(
            SUM(amount)
            /
            NULLIF(
                (
                    SELECT COALESCE(SUM(quantity),0)
                    FROM production_records
                ),
                0
            ),
            0
        ) AS overhead_per_unit
    FROM expenses
    WHERE cost_type IN ('OVERHEAD','FIXED','FACTORY')
)

SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.weight_kg,

    COALESCE(
        p.weight_kg *
        (
            COALESCE(material.material_cost_kg,0)
            +
            (
                COALESCE(grinding.grinding_cost_per_kg,0)
                *
                COALESCE(material.scrap_grind_pct,0)
            )
        ),
        0
    ) AS material_cost,

    COALESCE(
        p.standard_minutes *
        factory_rate.production_cost_per_minute,
        0
    ) AS production_cost,

    COALESCE(overhead.overhead_per_unit,0) AS overhead_cost,

    (
        COALESCE(
            p.weight_kg *
            (
                COALESCE(material.material_cost_kg,0)
                +
                (
                    COALESCE(grinding.grinding_cost_per_kg,0)
                    *
                    COALESCE(material.scrap_grind_pct,0)
                )
            ),
            0
        )
        +
        COALESCE(
            p.standard_minutes *
            factory_rate.production_cost_per_minute,
            0
        )
        +
        COALESCE(overhead.overhead_per_unit,0)
    ) AS base_cost,

    (
        COALESCE(
            p.weight_kg *
            (
                COALESCE(material.material_cost_kg,0)
                +
                (
                    COALESCE(grinding.grinding_cost_per_kg,0)
                    *
                    COALESCE(material.scrap_grind_pct,0)
                )
            ),
            0
        )
        +
        COALESCE(
            p.standard_minutes *
            factory_rate.production_cost_per_minute,
            0
        )
        +
        COALESCE(overhead.overhead_per_unit,0)
    ) AS final_unit_cost,

    (
        (
            COALESCE(
                p.weight_kg *
                (
                    COALESCE(material.material_cost_kg,0)
                    +
                    (
                        COALESCE(grinding.grinding_cost_per_kg,0)
                        *
                        COALESCE(material.scrap_grind_pct,0)
                    )
                ),
                0
            )
            +
            COALESCE(
                p.standard_minutes *
                factory_rate.production_cost_per_minute,
                0
            )
            +
            COALESCE(overhead.overhead_per_unit,0)
        )
        / 0.8
    ) AS suggested_sale_price

FROM products p
LEFT JOIN material
    ON material.product_id = p.id
CROSS JOIN grinding
CROSS JOIN factory_rate
CROSS JOIN overhead;

COMMIT;
