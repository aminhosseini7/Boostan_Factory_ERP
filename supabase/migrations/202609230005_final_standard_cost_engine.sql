-- Fix for 202609230005_final_standard_cost_engine
-- Correct grinding cost columns based on actual grinding_records schema

CREATE OR REPLACE VIEW v_final_grinding_cost AS
SELECT
    COALESCE(
        SUM(
            COALESCE(daily_cost,0)
        )
        /
        NULLIF(SUM(total_weight),0),
        0
    ) AS grinding_cost_per_kg
FROM grinding_records;
