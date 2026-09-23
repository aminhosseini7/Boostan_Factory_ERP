import React, { useState } from "react";

export default function ProductAnalytics({ products = [] }) {
  const [selectedProduct, setSelectedProduct] = useState("");
  const [marginPct, setMarginPct] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const getToken = () =>
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("auth_token") ||
    "";

  async function calculateCosting() {
    if (!selectedProduct) return;

    setLoading(true);

    try {
      const token = getToken();

      const res = await fetch(
        `/api/products/costing?productId=${selectedProduct}&marginPct=${marginPct}`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
        }
      );

      const json = await res.json();

      if (json.success === false) {
        setResult(null);
        return;
      }

      setResult(json.data || json.product || json);
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
              <td>{Number(result.totalCost || result.unitCost || 0).toLocaleString()}</td>
              <td>{Number(result.suggestedPrice || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
