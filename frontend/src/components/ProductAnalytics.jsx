import React, { useState } from 'react';
import api from '../services/api';

const numberFa = (value) => Number(value).toLocaleString('fa-IR', {
  maximumFractionDigits: 2,
});

const confidenceLabel = {
  HIGH: 'بالا',
  MEDIUM: 'متوسط',
  LOW: 'کم',
};

export default function ProductAnalytics({ products = [] }) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [secondsByProduct, setSecondsByProduct] = useState({});
  const [defectPctByProduct, setDefectPctByProduct] = useState({});
  const [marginPct, setMarginPct] = useState('20');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const seconds = secondsByProduct[selectedProduct] ?? '';
  const defectPct = defectPctByProduct[selectedProduct] ?? '';

  async function calculateCosting() {
    if (loading) return;
    setResult(null);
    setMessage('');
    if (!selectedProduct) {
      setMessage('ابتدا محصول را انتخاب کنید.');
      return;
    }
    const margin = Number(marginPct);
    if (marginPct === '' || !Number.isFinite(margin) || margin < 0 || margin >= 100) {
      setMessage('حاشیه سود باید بین صفر و کمتر از ۱۰۰ درصد باشد.');
      return;
    }

    const params = { productId: selectedProduct, margin };
    if (manualMode) {
      const cycle = Number(seconds);
      const defectiveRate = Number(defectPct);
      if (seconds === '' || !Number.isFinite(cycle) || cycle <= 0 || cycle > 86400) {
        setMessage('زمان تولید هر سبد باید عددی مثبت و حداکثر ۸۶۴۰۰ ثانیه باشد.');
        return;
      }
      if (defectPct === '' || !Number.isFinite(defectiveRate) || defectiveRate < 0 || defectiveRate >= 100) {
        setMessage('نرخ معیوب باید بین صفر و کمتر از ۱۰۰ درصدِ کل تولید باشد. اگر معیوب ندارید عدد صفر را وارد کنید.');
        return;
      }
      params.cycleSeconds = cycle;
      params.defectPct = defectiveRate;
    }

    setLoading(true);
    try {
      const response = await api.get('/products/analytics', { params });
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
            }}
          />
        </label>

        <button type="button" onClick={calculateCosting} disabled={loading || !selectedProduct}>
          {loading ? 'در حال محاسبه...' : 'محاسبه خودکار'}
        </button>

        <button
          type="button"
          className="ghost"
          disabled={loading}
          onClick={() => {
            setManualMode((value) => !value);
            setResult(null);
            setMessage('');
          }}
        >
          {manualMode ? 'بازگشت به داده واقعی' : 'سناریوی دستی (اختیاری)'}
        </button>

        {manualMode && <>
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
            نرخ معیوب از کل تولید (%)
            <input
              type="number"
              min="0"
              max="99.99"
              step="any"
              inputMode="decimal"
              value={defectPct}
              disabled={!selectedProduct || loading}
              placeholder="مثلاً 5 یا 0"
              onChange={(e) => {
                setDefectPctByProduct((prev) => ({ ...prev, [selectedProduct]: e.target.value }));
                setResult(null);
                setMessage('');
              }}
            />
          </label>
        </>}
      </div>

      <p className="hint">
        حالت پیش‌فرض از داده واقعی شیفت‌ها استفاده می‌کند؛ نرخ معیوب از تولید ثبت‌شده و زمان متوسط مؤثر از فاصله ثبت کانتر شروع دو شیفت متوالی محاسبه می‌شود. سناریوی دستی فقط برای آزمون مدیریتی باقی مانده است.
      </p>

      {message && <div className="error" role="alert">{message}</div>}

      {result && (
        <>
          {result.costingInputMode === 'AUTO_OBSERVED' && <div className="success" role="status">
            محاسبه خودکار از داده واقعی: زمان متوسط مؤثر {numberFa(result.productionSeconds)} ثانیه برای هر چرخه، نرخ معیوب {numberFa(result.defectPct)}٪، بر پایه {numberFa(result.observedFinalizedRuns)} شیفت نهایی‌شده در حداکثر {numberFa(result.observedLookbackDays)} روز اخیر. اطمینان داده: {confidenceLabel[result.observedConfidence] || 'نامشخص'}.
          </div>}
          {result.costingInputMode === 'MANUAL' && <div className="warning" role="status">
            این نتیجه با سناریوی دستی مدیر محاسبه شده است و جایگزین آمار واقعی تولید نیست.
          </div>}
          <p className="hint">
            ماه هزینه: {result.expenseMonth} (شمسی) | ظرفیت نظری ماهانه برای این سبد: {' '}
            {numberFa(result.estimatedMonthlyCapacity)} چرخه (۲۶ روز × ۲۳ ساعت مفید در روز).
            {' '}نرخ معیوب مبنا: {numberFa(result.defectPct)}٪؛
            {' '}سالم قابل فروش: {numberFa(result.estimatedMonthlyGoodCapacity)} عدد؛
            {' '}معیوب مورد انتظار: {numberFa(result.estimatedMonthlyDefectCapacity)} عدد.
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
                  <th>هزینه مواد هر چرخه (با ترکیب آسیاب)</th>
                  <th>هزینه خالص اضافی مواد معیوب (فرض بازیافت کامل ارزش مواد)</th>
                  <th>هزینه آسیاب مجزا</th>
                  <th>سهم سربار هر سبد سالم (شامل حقوق و معیوبی)</th>
                  <th>بهای تمام‌شده برآوردی</th>
                  <th>قیمت فروش پیشنهادی</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{numberFa(result.materialCost)}</td>
                  <td>{numberFa(result.defectMaterialAllowance)}</td>
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
            با فرض بازیافت کامل و حفظ ارزش مواد سبدهای معیوب، هزینه اضافی مواد معیوب صفر در نظر گرفته می‌شود؛
            اما هزینه زمان تولید چرخه‌های ناموفق از طریق سربار بر سبدهای سالم سرشکن می‌شود.
            افت وزن یا ارزش بازیافت و هزینه‌های بازیافتِ منظور‌نشده در قیمت مواد در این برآورد محاسبه نشده‌اند.
          </p>
        </>
      )}
    </div>
  );
}
