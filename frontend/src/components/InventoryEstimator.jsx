import {useState} from 'react';
import api from '../services/api';import NumericInput from './NumericInput';import {formatNumber} from '../utils/fa';import {formatJalaliDateTime} from '../utils/jalali';
export default function InventoryEstimator(){
 const [counter,setCounter]=useState(''),[defects,setDefects]=useState('0'),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function calculate(e){e.preventDefault();setResult(null);setError('');if(!/^\d{7}$/.test(String(counter))){setError('کانتر باید دقیقاً ۷ رقم باشد؛ صفرهای ابتدا را وارد کنید.');return}
 try{setBusy(true);setResult((await api.post('/inventory/estimate',{counter,defects})).data)}catch(err){setError(err.response?.data?.message||err.message)}finally{setBusy(false)}}
 return <form className="panel form-grid" onSubmit={calculate}><h3 className="wide">محاسبه‌گر موجودی لحظه‌ای (فقط نمایش)</h3>
 <p className="hint wide">هنگام شیفت باز، مدیر کانتر فعلی و تعداد معیوب مشاهده‌شده از شروع همان شیفت را وارد کند. این محاسبه هیچ تغییری در کانتر ثبت‌شده یا موجودی قطعی ایجاد نمی‌کند.</p>
 <label>کانتر فعلی دستگاه (۷ رقم)<NumericInput required inputMode="numeric" value={counter} onChange={e=>setCounter(e.target.value)}/></label>
 <label>معیوب مشاهده‌شده از شروع شیفت<NumericInput required inputMode="numeric" value={defects} onChange={e=>setDefects(e.target.value)}/></label>
 <button disabled={busy}>{busy?'در حال بررسی…':'محاسبه موجودی همین لحظه'}</button>
 {error&&<p className="wide field-error">{error}</p>}
 {result&&<div className="wide estimate"><b>سبد: {result.productName} | اپراتور: {result.operatorName}</b>
 <p>زمان: {formatJalaliDateTime(result.asOf)} ــ تولید ناخالص از شروع شیفت: {formatNumber(result.gross)} ــ سالم برآوردی: {formatNumber(result.estimatedGood)}</p>
 <p>موجودی قطعی ثبت‌شده: <b>{formatNumber(result.postedStock)}</b> عدد؛ موجودی لحظه‌ای برآوردی: <b>{formatNumber(result.estimatedStock)}</b> عدد</p><small>{result.note}</small></div>}
 </form>;
}
