import React, { useState } from "react";
import api from "../services/api";

export default function ProductAnalytics({ products = [] }) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [marginPct, setMarginPct] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function calculateCosting() {
  if (!selectedProduct) return;

  setLoading(true);

  try {
    const response = await api.get(
  `/products/analytics?productId=${selectedProduct}&margin=${marginPct}&t=${Date.now()}`
  );

console.log("MARGIN SENT:", marginPct);

    const data = response.data;

    console.log("COSTING RESPONSE:", data);

    const row = (data.rows || []).find(
      (item) => item.productId === selectedProduct
    );

    setResult(row || null);

  } catch (error) {
    console.error("Costing error:", error);
    setResult(null);
  } finally {
    setLoading(false);
  }
}

  return (
    <div className="panel">
      <h3>دستیار بهای تمام‌شده محصولات</h3>

      <div className="form-grid">
        <label>
          انتخاب سبد
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">انتخاب کنید</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          حاشیه سود هدف مدیر (%)
          <input
            type="number"
            value={marginPct}
            onChange={(e) => setMarginPct(Number(e.target.value))}
          />
        </label>

        <button onClick={calculateCosting}>
          محاسبه
        </button>
      </div>

      {loading && <p>در حال محاسبه...</p>}

      {result && (
        <table>
          <thead>
            <tr>
              <th>هزینه مواد</th>
              <th>هزینه آسیاب</th>
              <th>سهم سربار</th>
              <th>بهای تمام‌شده</th>
              <th>قیمت پیشنهادی</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{Number(result.materialCost || 0).toLocaleString()}</td>
              <td>{Number(result.grindingCost || 0).toLocaleString()}</td>
              <td>{Number(result.overheadCost || 0).toLocaleString()}</td>
              <td>{Number(result.estimatedUnitCost || 0).toLocaleString()}</td>
              <td>{Number(result.suggestedSalePrice || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
