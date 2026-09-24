import React, { useState } from 'react';
import api from '../services/api';

const numberFa = (value) => Number(value).toLocaleString('fa-IR', {
  maximumFractionDigits: 2,
});

export default function ProductAnalytics({ products = [] }) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [secondsByProduct, setSecondsByProduct] = useState({});
  const [marginPct, setMarginPct] = useState('20');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const seconds = secondsByProduct[selectedProduct] ?? '';

  async function calculateCosting() {
    if (loading) return;
    setResult(null);
    setMessage('');
    if (!selectedProduct) {
      setMessage('ابتدا محصول را انتخاب کنید.');
      return;
    }
    const cycle = Number(seconds);
    const margin = Number(marginPct);
    if (seconds === '' || !Number.isFinite(cycle) || cycle <= 0 || cycle > 86400) {
      setMessage('زمان تولید هر سبد باید عددی مثبت و حداکثر ۸۶۴۰۰ ثانیه باشد.');
      return;
    }
    if (marginPct === '' || !Number.isFinite(margin) || margin < 0 || margin >= 100) {
      setMessage('حاشیه سود باید بین صفر و کمتر از ۱۰۰ درصد باشد.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/products/analytics', {
        params: { productId: selectedProduct, margin, cycleSeconds: cycle },
      });
      const row = (response.data?.rows || []).find(
        (item) => String(item.productId) === String(selectedProduct)
      );
      if (!row || row.costingMode !== 'CURRENT_MONTH_FORECAST') {
        throw new Error('خروجی برآورد تولید دریافت نشد؛ نسخه API را بررسی کنید.');
      }
      setResult(row);
    } catch (error) {
      console.error('Costing error:', error);
      setMessage(error?.response?.data?.message || error?.message || 'محاسبه انجام نشد.');
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
            disabled={loading}
            onChange={(e) => {
              setSelectedProduct(e.target.value);
              setResult(null);
              setMessage('');
            }}
          >
            <option value="">انتخاب کنید</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label>
          زمان متوسط تولید هر سبد (ثانیه)
          <input
            type="number"
            min="0.01"
            max="86400"
            step="any"
            inputMode="decimal"
            value={seconds}
            disabled={!selectedProduct || loading}
            placeholder="مثلاً 20"
            onChange={(e) => {
              const value = e.target.value;
              setSecondsByProduct((prev) => ({ ...prev, [selectedProduct]: value }));
              setResult(null);
              setMessage('');
            }}
          />
        </label>

        <label>
          حاشیه سود هدف مدیر (%)
          <input
            type="number"
            min="0"
            max="99.99"
            step="any"
            value={marginPct}
            disabled={loading}
            onChange={(e) => {
              setMarginPct(e.target.value);
              setResult(null);
              setMessage('');
            }}
          />
        </label>

        <button type="button" onClick={calculateCosting} disabled={loading}>
          {loading ? 'در حال محاسبه...' : 'محاسبه'}
        </button>
      </div>

      {message && <div className="error" role="alert">{message}</div>}

      {result && (
        <>
          <p className="hint">
            ماه هزینه: {result.expenseMonth} (شمسی) | ظرفیت نظری ماهانه برای این سبد: {' '}
            {numberFa(result.estimatedMonthlyCapacity)} عدد (۲۶ روز × ۲۳ ساعت مفید در روز).
            سربار ماهانه: {numberFa(result.monthlyOverhead)} تومان؛ {' '}
            سهم عادی: {numberFa(result.monthlyNormalExpenses)}، {' '}
            سهم هزینه‌های سنگین با افزایش ۴٪ ماهانه: {numberFa(result.monthlyHeavyAllocation)} تومان.
          </p>
          {result.overheadExpenseCount === 0 && (
            <div className="warning" role="status">
              برای ماه جاری هزینه قابل تخصیصی پیدا نشد؛ صفر بودن سربار ممکن است به معنای ثبت‌نشدن هزینه‌ها باشد.
            </div>
          )}
          <div className="table-scroll" style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <table style={{ minWidth: 750 }}>
              <thead>
                <tr>
                  <th>هزینه مواد (با ترکیب آسیاب)</th>
                  <th>هزینه آسیاب مجزا</th>
                  <th>سهم سربار (شامل حقوق)</th>
                  <th>بهای تمام‌شده برآوردی</th>
                  <th>قیمت فروش پیشنهادی</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{numberFa(result.materialCost)}</td>
                  <td>{numberFa(result.grindingCost)}</td>
                  <td>{numberFa(result.overheadCost)}</td>
                  <td>{numberFa(result.estimatedUnitCost)}</td>
                  <td>{numberFa(result.suggestedSalePrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="hint">
            هزینه آسیاب مجزا فعلاً اضافه نمی‌شود؛ سهم آسیاب موجود در بهای ترکیبی مواد حفظ شده
            تا یک هزینه دوبار محاسبه نشود. همه هزینه‌های ثبت‌شده در منوی هزینه‌ها، از جمله حقوق، در سربار منظور می‌شوند.
          </p>
        </>
      )}
    </div>
  );
}
