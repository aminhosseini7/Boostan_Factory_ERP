import {useEffect,useState} from 'react';
import api from '../services/api';
import JalaliDateInput,{validateJalaliRange} from './JalaliDateInput';
import {todayJalali} from '../utils/jalali';
import {formatToman,formatNumber} from '../utils/fa';
export default function ProductAnalytics({products=[]}){
 const [from,setFrom]=useState(todayJalali()),[to,setTo]=useState(todayJalali());
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{setBusy(true);setError('');const range=validateJalaliRange(from,to);if(!range.from||!range.to)throw Error('بازه زمانی کامل وارد کنید');setData((await api.get('/products/analytics',{params:range})).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[]);
 const fmt=v=>v==null?'نامشخص':formatToman(v);
 return <div className="panel"><h3>بهای تمام‌شده و سود هر نوع سبد (برآورد مدیریتی)</h3>
 <div className="toolbar manager-date-toolbar"><JalaliDateInput label="از تاریخ" value={from} onChange={setFrom}/><JalaliDateInput label="تا تاریخ" value={to} onChange={setTo}/><button type="button" onClick={load} disabled={busy}>{busy?'در حال محاسبه…':'محاسبه'}</button></div>
 {error&&<p className="field-error">{error}</p>}
 <p className="hint">هر محصول جداگانه بررسی می‌شود. مبلغ سود فقط برآورد است، نه سود قطعی حسابداری؛ وقتی اطلاعات هزینه و تولید کافی نباشد، به‌جای صفر «نامشخص» نمایش داده می‌شود.</p>
 <div className="report-table"><table><thead><tr><th>سبد</th><th>فروش خالص دوره</th><th>تعداد خالص فروخته‌شده</th><th>هزینه واحد (برآورد)</th><th>سود هر عدد (برآورد)</th><th>سود کل دوره (برآورد)</th><th>حاشیه سود (برآورد)</th></tr></thead><tbody>
 {(data?.rows||[]).map(x=><tr key={x.productId}><td>{x.productName}{!x.isActive?' (غیرفعال)':''}</td><td>{fmt(x.netRevenue)}</td><td>{formatNumber(x.netUnits)}</td><td>{fmt(x.estimatedUnitCost)}</td><td>{fmt(x.estimatedUnitProfit)}</td><td>{fmt(x.estimatedGrossProfit)}</td><td>{x.estimatedMarginPct==null?'نامشخص':`${formatNumber(x.estimatedMarginPct)}٪`}</td></tr>)}
 </tbody></table></div>{data&&<p className="hint">{data.disclaimer}</p>}</div>;
}
