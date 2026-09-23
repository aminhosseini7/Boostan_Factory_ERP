import React, { useEffect, useState } from "react";

export default function ProductAnalytics() {
  const [data, setData] = useState([]);
  const [marginPct, setMarginPct] = useState(20);
  const [loading, setLoading] = useState(false);

  async function loadCosting() {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/costing?marginPct=${marginPct}`);
      const json = await res.json();
      setData(json.products || json || []);
    } catch (err) {
      console.error("Costing load error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCosting();
  }, []);

  return (
    <div className="card">
      <div className="section-header">
        <h3>دستیار بهای تمام‌شده محصولات</h3>

        <div>
          <label>حاشیه سود هدف مدیر (%) </label>
          <input
            type="number"
            value={marginPct}
            onChange={(e) => setMarginPct(Number(e.target.value))}
          />
          <button onClick={loadCosting}>محاسبه</button>
        </div>
      </div>

      {loading ? (
        <p>در حال محاسبه...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>محصول</th>
              <th>تعداد تولید</th>
              <th>هزینه مواد</th>
              <th>هزینه آسیاب</th>
              <th>سهم سربار</th>
              <th>بهای تمام‌شده</th>
              <th>قیمت پیشنهادی</th>
            </tr>
          </thead>

          <tbody>
            {data.map((item, index) => (
              <tr key={item.id || index}>
                <td>{item.productName || item.name}</td>
                <td>{item.productionUnits || item.quantity || 0}</td>
                <td>{Number(item.materialCost || 0).toLocaleString()}</td>
                <td>{Number(item.grindingCost || 0).toLocaleString()}</td>
                <td>{Number(item.overheadCost || 0).toLocaleString()}</td>
                <td>{Number(item.totalCost || item.unitCost || 0).toLocaleString()}</td>
                <td>{Number(item.suggestedPrice || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
