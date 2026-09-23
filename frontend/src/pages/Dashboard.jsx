import {useEffect,useMemo,useState} from 'react';import {Link} from 'react-router-dom';import {LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';import api from '../services/api';import {Page,Card,ErrorBox} from '../components/Ui';import {formatJalaliDateTime,gregorianKeyToJalali,todayJalali,jalaliToGregorianDate} from '../utils/jalali';
import JalaliDateInput,{validateJalaliRange} from '../components/JalaliDateInput';import {formatToman,formatNumber,activityLabel} from '../utils/fa';
const n=v=>formatNumber(v);
export default function Dashboard(){
 const [from,setFrom]=useState(todayJalali()),[to,setTo]=useState(todayJalali());
 const [d,setD]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false);
 const [period,setPeriod]=useState('امروز');
 async function load(start=from,end=to){try{
  setBusy(true);setError(null);const range=validateJalaliRange(start,end);
  if(!range.from||!range.to)throw Error('بازه زمانی را کامل انتخاب کنید');
  const a=await api.get('/dashboard',{params:range});setD(a.data);
 }catch(e){setError(e)}finally{setBusy(false)}}
 useEffect(()=>{load()},[]);
 function setPreset(preset){
   const now=todayJalali();let start=now;
   if(preset==='ماه جاری')start=now.slice(0,7)+'/01';
   else if(preset==='سال جاری')start=now.slice(0,4)+'/01/01';
   else if(preset==='هفته جاری'){
    const gd=jalaliToGregorianDate(now);
    const utc=new Date(`${gd}T12:00:00Z`);
    const days=(utc.getUTCDay()+1)%7;utc.setUTCDate(utc.getUTCDate()-days);
    // ISO Jalali formatting may include localized separators; extract year/month/day via formatToParts.
    const parts=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(utc);
    const digits=x=>String(x).replace(/[۰-۹]/g,ch=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));
    start=`${digits(parts.find(x=>x.type==='year')?.value)}/${digits(parts.find(x=>x.type==='month')?.value)}/${digits(parts.find(x=>x.type==='day')?.value)}`;
   }
   setFrom(start);setTo(now);setPeriod(preset);load(start,now);
 }
 const prod=useMemo(()=>(d?.productionSeries||[]).map(x=>({...x,label:gregorianKeyToJalali(x.date)})),[d]);
 const sales=useMemo(()=>(d?.salesSeries||[]).map(x=>({...x,label:gregorianKeyToJalali(x.date)})),[d]);
 const label=period==='دلخواه'?'بازه انتخابی':period;
 return <Page title="داشبورد مدیریت" actions={<Link className="quick-sale-link" to="/sales">ثبت فروش سریع</Link>}>
 <ErrorBox error={error}/><div className="panel"><h3>فیلتر زمانی تمام شاخص‌ها</h3><div className="toolbar manager-date-toolbar">
 {['امروز','هفته جاری','ماه جاری','سال جاری'].map(x=><button type="button" key={x} className={period===x?'':'ghost'} onClick={()=>setPreset(x)} disabled={busy}>{x}</button>)}
 <JalaliDateInput label="از تاریخ" value={from} onChange={v=>{setFrom(v);setPeriod('دلخواه')}}/>
 <JalaliDateInput label="تا تاریخ" value={to} onChange={v=>{setTo(v);setPeriod('دلخواه')}}/>
 <button type="button" onClick={()=>load()} disabled={busy}>{busy?'در حال بارگذاری…':'اعمال بازه'}</button></div>
 <p className="hint">موجودی انبار و بدهی مشتریان، مانده در پایان روز آخر بازه هستند؛ فروش، تولید و جریان نقدی فقط مربوط به خود بازه‌اند. ارزش موجودی با قیمت فروش نمایش داده شده و بهای تمام‌شده آن نیست.</p></div>
 <div className="cards dashboard-cards">
 <Card label={`تولید سالم ـ ${label}`} value={n(d?.todayProduction)}/>
 <Card label={`تولید ناخالص ـ ${label}`} value={n(d?.todayGrossProduction)}/>
 <Card label={`نرخ معیوب ـ ${label}`} value={`${n(d?.todayDefectRate)}٪`}/>
 <Card label={`فروش ناخالص ـ ${label}`} value={formatToman(d?.todayGrossSales)}/>
 <Card label={`فروش خالص ـ ${label}`} value={formatToman(d?.todaySales)}/>
 <Card label="بدهی مشتریان در پایان بازه" value={formatToman(d?.customerDebt)}/>
 <Card label="مواد اولیه آماده در پایان بازه" value={`${n(d?.rawMaterialReadyKg)} کیلوگرم`}/>
 <Card label="ضایعات قابل آسیاب در پایان بازه" value={`${n(d?.grindableScrapKg)} کیلوگرم`}/>
 <Card label="ارزش موجودی سبد در پایان بازه (با قیمت فروش)" value={formatToman(d?.inventoryValue)}/>
 <Card label={`ورودی نقدی ـ ${label}`} value={formatToman(d?.monthCashIn)}/>
 <Card label={`خروجی نقدی ـ ${label}`} value={formatToman(d?.monthCashOut)}/>
 <Card label={`جریان نقدی ـ ${label}`} value={formatToman(d?.monthNetCashFlow)}/>
 </div>
 <div className="grid2"><div className="panel"><h3>روند تولید سالم در بازه</h3><ResponsiveContainer width="100%" height={260}><LineChart data={prod}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip/><Line type="monotone" dataKey="total"/></LineChart></ResponsiveContainer></div>
 <div className="panel"><h3>روند فروش خالص در بازه</h3><ResponsiveContainer width="100%" height={260}><LineChart data={sales}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip/><Line type="monotone" dataKey="total"/></LineChart></ResponsiveContainer></div></div>
 <div className="panel"><h3>فعالیت‌های ۵۰ ساعت گذشته (مستقل از فیلتر)</h3><div className="report-table recent-scroll"><table><thead><tr><th>کاربر</th><th>عملیات</th><th>زمان شمسی</th></tr></thead><tbody>{(d?.recentActivities||[]).map(x=><tr key={x.id}><td>{x.userName||'-'}</td><td>{activityLabel[x.action]||'فعالیت ثبت‌شده'}</td><td>{formatJalaliDateTime(x.createdAt)}</td></tr>)}</tbody></table></div></div>
 <div className="panel"><h3>بهای تمام‌شده و سود هر سبد</h3><p className="hint">محاسبه جداگانه و فیلتر زمانی بهای تمام‌شده و سود در بخش «محصولات ← بهای تمام‌شده و سود هر نوع سبد» قرار دارد. محاسبات آن برآوردی‌اند، نه نتیجه حسابرسی قطعی.</p><Link to="/products">نمایش تحلیل هر نوع سبد</Link></div>
 </Page>;
}
