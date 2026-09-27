import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
import api from '../services/api';
import {Page,Card,ErrorBox} from '../components/Ui';
import {formatJalaliDateTime,gregorianKeyToJalali,todayJalali,jalaliToGregorianDate} from '../utils/jalali';
import JalaliDateInput,{validateJalaliRange} from '../components/JalaliDateInput';
import {formatToman,formatNumber,activityLabel} from '../utils/fa';

const n=v=>formatNumber(v);
const periodPresets=['امروز','دیروز','هفته جاری','ماه جاری','سال جاری'];
const shortMoney=value=>{
  const amount=Number(value)||0;
  const abs=Math.abs(amount);
  if(abs>=1e9)return `${n(amount/1e9)} میلیارد`;
  if(abs>=1e6)return `${n(amount/1e6)} میلیون`;
  if(abs>=1e3)return `${n(amount/1e3)} هزار`;
  return n(amount);
};

export default function Dashboard(){
  const [from,setFrom]=useState(todayJalali());
  const [to,setTo]=useState(todayJalali());
  const [period,setPeriod]=useState('امروز');
  const [activeRange,setActiveRange]=useState(null);
  const [d,setD]=useState(null);
  const [error,setError]=useState(null);
  const [busy,setBusy]=useState(false);
  const [showAllActivities,setShowAllActivities]=useState(false);
  const requestSequence=useRef(0);

  async function load(start,end,rangeLabel){
    const sequence=++requestSequence.current;
    setBusy(true);
    setError(null);
    try{
      const range=validateJalaliRange(start,end);
      if(!range.from||!range.to)throw new Error('بازه زمانی را کامل انتخاب کنید.');
      const todayGregorian=jalaliToGregorianDate(todayJalali());
      if(range.to>todayGregorian)throw new Error('تاریخ پایان گزارش نمی‌تواند بعد از امروز باشد؛ سود و زیان فقط برای دوره تحقق‌یافته محاسبه می‌شود.');
      const response=await api.get('/dashboard',{params:range});
      if(sequence!==requestSequence.current)return;
      if(!response?.data||typeof response.data!=='object')throw new Error('پاسخ داشبورد معتبر نیست.');
      setD(response.data);
      setActiveRange({from:start,to:end,label:rangeLabel});
      setShowAllActivities(false);
    }catch(e){
      if(sequence===requestSequence.current)setError(e);
    }finally{
      if(sequence===requestSequence.current)setBusy(false);
    }
  }

  useEffect(()=>{
    const today=todayJalali();
    load(today,today,'امروز');
    return ()=>{requestSequence.current+=1;};
  },[]);

  function setPreset(preset){
    const now=todayJalali();
    let start=now,end=now;
    if(preset==='دیروز'){
      const gd=jalaliToGregorianDate(now);
      const utc=new Date(`${gd}T12:00:00Z`);
      utc.setUTCDate(utc.getUTCDate()-1);
      const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{
        timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'
      }).formatToParts(utc);
      const part=type=>String(parts.find(x=>x.type===type)?.value||'').padStart(2,'0');
      const yesterday=`${parts.find(x=>x.type==='year')?.value}/${part('month')}/${part('day')}`;
      start=yesterday;
      end=yesterday;
    } else if(preset==='ماه جاری')start=now.slice(0,7)+'/01';
    else if(preset==='سال جاری')start=now.slice(0,4)+'/01/01';
    else if(preset==='هفته جاری'){
      const gd=jalaliToGregorianDate(now);
      const utc=new Date(`${gd}T12:00:00Z`);
      const days=(utc.getUTCDay()+1)%7;
      utc.setUTCDate(utc.getUTCDate()-days);
      const parts=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{
        timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'
      }).formatToParts(utc);
      const digits=x=>String(x).replace(/[۰-۹]/g,ch=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));
      start=`${digits(parts.find(x=>x.type==='year')?.value)}/${digits(parts.find(x=>x.type==='month')?.value)}/${digits(parts.find(x=>x.type==='day')?.value)}`;
    }
    setFrom(start);
    setTo(end);
    setPeriod(preset);
    load(start,end,preset);
  }

  const productionSeries=useMemo(()=>(d?.productionSeries||[]).map(x=>({...x,label:gregorianKeyToJalali(x.date)})),[d]);
  const salesSeries=useMemo(()=>(d?.salesSeries||[]).map(x=>({...x,label:gregorianKeyToJalali(x.date)})),[d]);
  const activities=d?.recentActivities||[];
  const visibleActivities=showAllActivities?activities:activities.slice(0,8);
  const ready=!!d&&!busy;
  const periodLabel=activeRange?.label||'امروز';
  const pnl=d?.profitLoss||null;
  const pnlConfidence=pnl?.costingConfidence==='HIGH'?'بالا':pnl?.costingConfidence==='REVIEW'?'نیازمند بررسی داده':'برآوردی';

  return <Page title="داشبورد مدیریت" actions={<Link className="quick-sale-link" to="/sales">ثبت فروش سریع</Link>}>
    <style>{`
      .boostan-dashboard .dashboard-filter{padding:14px 18px}
      .boostan-dashboard .dashboard-filter-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
      .boostan-dashboard .dashboard-filter-top h3{margin:0}
      .boostan-dashboard .dashboard-presets{display:flex;flex-wrap:wrap;gap:7px}
      .boostan-dashboard .dashboard-dates{display:flex;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-top:12px}
      .boostan-dashboard .dashboard-dates .jalali-date-field{flex:1 1 220px;min-width:0}
      .boostan-dashboard .dashboard-dates>button{min-height:40px}
      .boostan-dashboard .dashboard-active-period{margin:12px 0 0;font-size:13px;color:var(--text-muted,#64748b)}
      .boostan-dashboard .dashboard-help{margin-top:9px;font-size:13px}
      .boostan-dashboard .dashboard-help summary{cursor:pointer}
      .boostan-dashboard .dashboard-help p{margin:8px 0 0}
      .boostan-dashboard .dashboard-section-title{margin:18px 0 10px;font-size:17px}
      .boostan-dashboard .dashboard-primary{grid-template-columns:repeat(4,minmax(0,1fr))}
      .boostan-dashboard .dashboard-secondary{grid-template-columns:repeat(3,minmax(0,1fr))}
      .boostan-dashboard .dashboard-primary .card{border-top:3px solid #059669}
      .boostan-dashboard .dashboard-primary .card strong{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
      .boostan-dashboard .dashboard-secondary .card strong{overflow-wrap:anywhere}
      .boostan-dashboard .dashboard-chart{min-width:0}
      .boostan-dashboard .dashboard-chart h3{margin-top:0}
      .boostan-dashboard .dashboard-chart-note{font-size:12px;color:#64748b;margin-top:8px}
      .boostan-dashboard .dashboard-loading{padding:28px 12px;text-align:center}
      .boostan-dashboard .dashboard-loading[role=status]{color:var(--text-muted,#64748b)}
      .boostan-dashboard .dashboard-old-data{margin:10px 0;padding:10px 12px;border-radius:9px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74}
      .boostan-dashboard .dashboard-activity-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .boostan-dashboard .dashboard-activity-head h3{margin:0}
      .boostan-dashboard .dashboard-activity-head button{font-size:13px}
      .boostan-dashboard .dashboard-activity-table{margin-top:12px}
      .boostan-dashboard .dashboard-pnl-note{margin:10px 0 0;padding:10px 12px;border-radius:9px;background:rgba(2,132,199,.07);border:1px solid rgba(2,132,199,.22)}
      .boostan-dashboard .dashboard-pnl-warning{margin:10px 0 0;padding:10px 12px;border-radius:9px;background:#fff7ed;color:#9a3412;border:1px solid #fdba74}
      @media(max-width:1100px){.boostan-dashboard .dashboard-primary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:700px){.boostan-dashboard .dashboard-primary,.boostan-dashboard .dashboard-secondary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:440px){.boostan-dashboard .dashboard-primary,.boostan-dashboard .dashboard-secondary{grid-template-columns:1fr}}
    `}</style>
    <div className="boostan-dashboard">
      <div className="panel dashboard-filter">
        <div className="dashboard-filter-top">
          <h3>بازه گزارش</h3>
          <div className="dashboard-presets" role="group" aria-label="بازه‌های آماده گزارش">
            {periodPresets.map(x=><button type="button" key={x} className={period===x?'':'ghost'} onClick={()=>setPreset(x)} disabled={busy} aria-pressed={period===x}>{x}</button>)}
          </div>
        </div>
        <div className="dashboard-dates">
          <JalaliDateInput label="از تاریخ" value={from} onChange={v=>{setFrom(v);setPeriod('دلخواه');}}/>
          <JalaliDateInput label="تا تاریخ" value={to} onChange={v=>{setTo(v);setPeriod('دلخواه');}}/>
          <button type="button" onClick={()=>load(from,to,'بازه انتخابی')} disabled={busy}>{busy?'در حال بارگذاری…':'اعمال بازه'}</button>
        </div>
        {activeRange&&<p className="dashboard-active-period">آمار نمایش‌داده‌شده: {periodLabel} (از {activeRange.from} تا {activeRange.to})</p>}
        <details className="dashboard-help"><summary>راهنمای شاخص‌ها و نحوه محاسبه بازه</summary><p className="hint">موجودی انبار و بدهی مشتریان، مانده در پایان روز آخر بازه هستند؛ فروش، تولید و جریان نقدی فقط مربوط به خود بازه‌اند. ارزش موجودی با قیمت فروش نمایش داده شده و بهای تمام‌شده آن نیست. سود و زیان عملیاتی، سهم روزانه سربار ماه را متناسب با روزهای بازه کسر می‌کند: هزینه‌های NORMAL همان ماه به‌علاوه سهم HEAVY سرشکن‌شده با رشد ۴٪ ماهانه. پرداخت نقدی کامل هزینه‌ها مستقل از این تخصیص در جریان نقدی دیده می‌شود.</p></details>
      </div>

      <ErrorBox error={error}/>
      {error&&d&&<div className="dashboard-old-data" role="status">اطلاعات بازه جدید دریافت نشد؛ در ادامه آخرین آمار موفق ({activeRange?.label}، {activeRange?.from} تا {activeRange?.to}) نمایش داده می‌شود.</div>}
      {busy&&<div className="panel dashboard-loading" role="status" aria-live="polite">در حال دریافت آمار بازه انتخابی…</div>}
      {!busy&&!d&&<div className="panel dashboard-loading" role="status">آمار داشبورد هنوز دریافت نشده است.</div>}

      {ready&&<>
        <h3 className="dashboard-section-title">نمای کلی ـ {periodLabel}</h3>
        <div className="cards dashboard-primary">
          <Card label="تولید سالم" value={n(d.todayProduction)} sub="تعداد سبد"/>
          <Card label="فروش خالص" value={formatToman(d.todaySales)}/>
          <Card label="بدهی مشتریان در پایان بازه" value={formatToman(d.customerDebt)}/>
          <Card label="جریان نقدی بازه" value={formatToman(d.monthNetCashFlow)}/>
        </div>

        <h3 className="dashboard-section-title">تولید</h3>
        <div className="cards dashboard-secondary">
          <Card label="تولید ناخالص" value={n(d.todayGrossProduction)} sub="تعداد سبد"/>
          <Card label="نرخ معیوب" value={`${n(d.todayDefectRate)}٪`}/>
        </div>

        <h3 className="dashboard-section-title">فروش</h3>
        <div className="cards dashboard-secondary">
          <Card label="فروش ناخالص" value={formatToman(d.todayGrossSales)}/>
        </div>

        {pnl&&<>
          <h3 className="dashboard-section-title">سود و زیان عملیاتی بازه</h3>
          <div className="cards dashboard-secondary">
            <Card label="درآمد خالص عملیاتی" value={formatToman(pnl.netSales)} sub="پس از مرجوعی و تخفیف تسویه"/>
            <Card label="بهای مواد سبدهای فروخته‌شده" value={formatToman(pnl.materialCogs)} sub="میانگین موزون متحرک"/>
            <Card label="سود پس از بهای مواد" value={formatToman(pnl.grossProfit)}/>
            <Card label="سهم NORMAL در بازه" value={formatToman(pnl.normalExpenses)} sub="سرشکن روزانه از هزینه ماه"/>
            <Card label="سهم HEAVY در بازه" value={formatToman(pnl.heavyExpensesAllocated)} sub="سرشکن ماهانه با رشد ۴٪"/>
            <Card label="سربار تخصیص‌یافته به بازه" value={formatToman(pnl.overheadAllocated)} sub="NORMAL + HEAVY"/>
            <Card label="کسری/خروج اصلاحی موجودی" value={formatToman(pnl.inventoryAdjustmentLoss)}/>
            <Card label="سود / زیان عملیاتی" value={formatToman(pnl.operatingProfit)} sub={`اطمینان بهای مواد: ${pnlConfidence}`}/>
          </div>
          <p className="dashboard-pnl-note hint">سربار هر ماه بر تعداد روزهای واقعی همان ماه شمسی تقسیم شده و فقط سهم روزهای داخل بازه محاسبه می‌شود. سهم HEAVY طبق مدت سرشکن انتخاب‌شده و رشد ۴٪ ماهانه وارد سربار می‌شود. تخفیف‌های زمان وصول ({formatToman(pnl.settlementDiscounts)}) نیز از درآمد عملیاتی کسر شده‌اند.</p>
          {pnl.costingConfidence!=='HIGH'&&<p className="dashboard-pnl-warning">{pnl.costingConfidence==='REVIEW'?`در بازسازی تاریخی بهای موجودی، خروجی بدون ورودی کافی قبلی دیده شده است (مواد: ${n(pnl.materialUnderflowQty)} کیلوگرم، محصول: ${n(pnl.finishedUnderflowQty)} عدد). این هشدار لزوماً به معنی کسری موجودی فعلی نیست؛ بخشی از بهای تاریخی با مبنای برآوردی تکمیل شده است.`:`بخشی از بهای مواد فروخته‌شده (${formatToman(pnl.estimatedCogs)}) به موجودی افتتاحیه یا ورودی‌های بدون بهای تاریخی دقیق وابسته است؛ بنابراین سود فعلاً برآوردی است و با گردش موجودی واقعی دقیق‌تر می‌شود.`}</p>}
        </>}

        <h3 className="dashboard-section-title">موجودی در پایان بازه</h3>
        <div className="cards dashboard-secondary">
          <Card label="مواد اولیه آماده" value={`${n(d.rawMaterialReadyKg)} کیلوگرم`}/>
          <Card label="ضایعات قابل آسیاب" value={`${n(d.grindableScrapKg)} کیلوگرم`}/>
          <Card label="ارزش موجودی سبد (با قیمت فروش)" value={formatToman(d.inventoryValue)} sub="ارزش فروش احتمالی؛ نه بهای تمام‌شده"/>
        </div>

        <h3 className="dashboard-section-title">جریان نقدی بازه</h3>
        <div className="cards dashboard-secondary">
          <Card label="ورودی نقدی" value={formatToman(d.monthCashIn)}/>
          <Card label="خروجی نقدی" value={formatToman(d.monthCashOut)}/>
        </div>

        <div className="grid2">
          <div className="panel dashboard-chart">
            <h3>روند تولید سالم در بازه</h3>
            {productionSeries.length? <ResponsiveContainer width="100%" height={260}>
              <LineChart data={productionSeries} margin={{top:8,right:8,left:10,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="label" tick={{fontSize:11}} minTickGap={18}/>
                <YAxis width={68} tick={{fontSize:11}} tickFormatter={v=>n(v)}/>
                <Tooltip labelFormatter={value=>`تاریخ: ${value}`} formatter={value=>[`${n(value)} سبد`,'تولید سالم']}/>
                <Line type="linear" dataKey="total" name="تولید سالم" stroke="#2563eb" dot={productionSeries.length<=14} activeDot={{r:5}}/>
              </LineChart>
            </ResponsiveContainer>:<p className="hint">در این بازه، داده‌ای برای نمودار تولید ثبت نشده است.</p>}
          </div>
          <div className="panel dashboard-chart">
            <h3>روند فروش خالص در بازه</h3>
            {salesSeries.length? <ResponsiveContainer width="100%" height={260}>
              <LineChart data={salesSeries} margin={{top:8,right:8,left:10,bottom:4}}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="label" tick={{fontSize:11}} minTickGap={18}/>
                <YAxis width={87} tick={{fontSize:11}} tickFormatter={shortMoney}/>
                <Tooltip labelFormatter={value=>`تاریخ: ${value}`} formatter={value=>[formatToman(value),'فروش خالص']}/>
                <Line type="linear" dataKey="total" name="فروش خالص" stroke="#059669" dot={salesSeries.length<=14} activeDot={{r:5}}/>
              </LineChart>
            </ResponsiveContainer>:<p className="hint">در این بازه، داده‌ای برای نمودار فروش ثبت نشده است.</p>}
            <p className="dashboard-chart-note">مقادیر محور عمودی خلاصه شده‌اند؛ مبلغ دقیق هر روز را با نشانگر مشاهده کنید.</p>
          </div>
        </div>

        <div className="panel">
          <div className="dashboard-activity-head">
            <h3>فعالیت‌های ۵۰ ساعت گذشته (مستقل از فیلتر)</h3>
            {activities.length>8&&<button type="button" className="ghost" onClick={()=>setShowAllActivities(x=>!x)} aria-expanded={showAllActivities}>{showAllActivities?'نمایش ۸ فعالیت اخیر':`نمایش همه (${n(activities.length)})`}</button>}
          </div>
          {activities.length?<div className="report-table dashboard-activity-table recent-scroll"><table>
            <thead><tr><th>کاربر</th><th>عملیات</th><th>زمان شمسی</th></tr></thead>
            <tbody>{visibleActivities.map(x=><tr key={x.id}><td>{x.userName||'-'}</td><td>{activityLabel[x.action]||(x.action?`عملیات: ${x.action}`:'فعالیت ثبت‌شده')}</td><td>{formatJalaliDateTime(x.createdAt)}</td></tr>)}</tbody>
          </table></div>:<p className="hint">فعالیتی در ۵۰ ساعت گذشته ثبت نشده است.</p>}
        </div>

        <div className="panel">
          <h3>بهای تمام‌شده و سود هر سبد</h3>
          <p className="hint">محاسبه جداگانه و فیلتر زمانی بهای تمام‌شده و سود در بخش «محصولات ← بهای تمام‌شده و سود هر نوع سبد» قرار دارد. محاسبات آن برآوردی‌اند، نه نتیجه حسابرسی قطعی.</p>
          <Link to="/products">نمایش تحلیل هر نوع سبد</Link>
        </div>
      </>}
    </div>
  </Page>;
}
