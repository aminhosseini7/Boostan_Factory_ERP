import React, { useEffect, useState } from "react";

export default function ProductAnalytics() {
  const [data, setData] = useState([]);
  const [marginPct, setMarginPct] = useState(20);
  const [loading, setLoading] = useState(false);

  const getToken = () => {
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("auth_token") ||
      ""
    );
  };

  async function loadCosting() {
    setLoading(true);

    try {
      const token = getToken();

      const response = await fetch(
        `/api/products/costing?marginPct=${marginPct}`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
        }
      );

      const json = await response.json();

      if (json.success === false) {
        console.error(json.message);
        setData([]);
        return;
      }

      setData(json.products || json.data || json || []);
    } catch (error) {
      console.error("Costing error:", error);
      setData([]);
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
          <label>حاشیه سود هدف مدیر (%)</label>
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
                <td>{item.productName || item.name || "-"}</td>
                <td>{item.productionUnits || item.quantity || 0}</td>
                <td>{Number(item.materialCost || 0).toLocaleString()}</td>
                <td>{Number(item.grindingCost || 0).toLocaleString()}</td>
                <td>{Number(item.overheadCost || 0).toLocaleString()}</td>
                <td>
                  {Number(
                    item.totalCost || item.unitCost || 0
                  ).toLocaleString()}
                </td>
                <td>
                  {Number(item.suggestedPrice || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
