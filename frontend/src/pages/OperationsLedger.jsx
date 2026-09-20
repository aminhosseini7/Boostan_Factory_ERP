import JalaliDateInput,{validateJalaliRange} from '../components/JalaliDateInput';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import {formatJalaliDateTime} from '../utils/jalali';
import {formatToman,formatNumber,shiftStatusLabel,activityLabel} from '../utils/fa';

const flowLabels={ALL:'همه جریان‌ها',MATERIAL:'جریان مواد',FINANCIAL:'جریان مالی',INFORMATION:'جریان اطلاعات'};
const kindLabels={ALL:'همه عملیات',PRODUCTION:'تولید',SALE:'فروش',PURCHASE:'خرید',GRINDING:'آسیاب',EXPENSE:'هزینه',RECEIPT:'وصول مطالبات',RETURN:'مرجوعی / ابطال',GRINDING_OUT:'خروج برای آسیاب',GRINDING_IN:'ورود مواد آسیاب‌شده',PRODUCTION_CONSUMPTION:'مصرف تولید',PRODUCTION_SCRAP:'ضایعات تولید'};
function correctionLink(issue){
  if(issue.code?.startsWith('SALE_'))return `/returns?saleId=${encodeURIComponent(issue.entityId||'')}`;
  if(issue.code==='NEGATIVE_MATERIAL'||issue.code==='NEGATIVE_FINISHED')return '/inventory';
  if(issue.code==='DEBTOR_PHONE')return '/customers';
  if(issue.code==='MISSING_WEIGHT')return '/products';
  if(issue.code==='GRINDING_MISMATCH')return '/grinding';
  return '/production';
}
export default function OperationsLedger(){
  const[rows,setRows]=useState([]),[flow,setFlow]=useState('ALL'),[kind,setKind]=useState('ALL'),[q,setQ]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState(null),[checks,setChecks]=useState(null),[checking,setChecking]=useState(false);
  async function load(){try{setError(null);const params={flow,kind,q};const dates=validateJalaliRange(from,to);if(dates.from)params.from=dates.from;if(dates.to)params.to=dates.to;setRows((await api.get('/operations-ledger',{params})).data)}catch(e){setError(e)}}
  async function runChecks(){if(checking)return;setChecking(true);setError(null);try{setChecks((await api.get('/reconciliation')).data)}catch(e){setError(e)}finally{setChecking(false)}}
  useEffect(()=>{load()},[]);
  return <Page title="دیتابیس و دفتر کل عملیات"><ErrorBox error={error}/>
    <div className="panel reconciliation"><h3>کنترل خودکار مغایرت‌ها</h3>
      <p className="hint">کنترل موجودی، انتقال مواد آسیاب، ثبت خروجی فروش، دفتر مالی و نقص اطلاعات. این یک بررسی مقدماتی و قابل پیگیری است، نه تأیید صحت حسابرسی کل کارخانه.</p>
      <button onClick={runChecks} disabled={checking}>{checking?'در حال بررسی…':'بررسی جریان مواد، مالی و اطلاعات'}</button>
      {checks&&<><p className="hint">آخرین بررسی: {formatJalaliDateTime(checks.checkedAt)} — {checks.scope}</p>
      <p>مواد: {checks.counts.MATERIAL} مورد | مالی: {checks.counts.FINANCIAL} مورد | اطلاعات: {checks.counts.INFORMATION} مورد</p>
      {checks.warnings.length?<div className="report-table recent-scroll"><table><thead><tr><th>جریان</th><th>مغایرت / هشدار</th><th>شرح</th><th>پیگیری</th></tr></thead><tbody>{checks.warnings.map(x=><tr key={x.id}><td>{flowLabels[x.flow]||x.flow}</td><td>{x.title}</td><td>{x.detail}</td><td><Link to={correctionLink(x)}>{x.code.startsWith('SALE_')?'بررسی و ابطال فروش':'بررسی مورد'}</Link></td></tr>)}</tbody></table></div>:<div className="success">در محدوده بررسی‌شده مغایرتی پیدا نشد؛ این نتیجه به معنی بررسی همه سوابق نیست.</div>}
      </>}
      <div className="correction-help"><b>اصلاح اشتباه ثبت‌شده</b><p>حذف مستقیم یک سند ثبت‌شده می‌تواند موجودی، بدهی و دفتر مالی را ناهماهنگ کند. فعلاً برای فاکتور از <Link to="/returns">ابطال / مرجوعی</Link> و برای موجودی از <Link to="/inventory">ثبت شمارش واقعی انبار</Link> استفاده کنید؛ سابقه اصلاح حفظ می‌شود. ابطال سایر عملیات تا زمان آماده‌شدن گردش معکوس حسابداری و آزمون کامل فعال نیست.</p></div>
    </div>
    <div className="panel toolbar"><select value={flow} onChange={e=>setFlow(e.target.value)}>{Object.entries(flowLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries(kindLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
      <input placeholder="جستجو: مشتری، محصول، دلیل..." value={q} onChange={e=>setQ(e.target.value)}/>
      <JalaliDateInput label="از تاریخ" id="ledger-from" value={from} onChange={setFrom}/><JalaliDateInput label="تا تاریخ" id="ledger-to" value={to} onChange={setTo}/>
      <button onClick={load}>اعمال فیلتر</button><button className="ghost" onClick={async()=>{setFlow('ALL');setKind('ALL');setQ('');setFrom('');setTo('');try{setError(null);setRows((await api.get('/operations-ledger',{params:{flow:'ALL',kind:'ALL',q:''}})).data)}catch(e){setError(e)}}}>پاک کردن فیلتر</button>
    </div>
    <div className="panel"><p className="hint">ثبت‌های تولید، فروش، خرید، آسیاب، هزینه، وصول، مرجوعی، گردش مواد، گردش مالی و رویدادهای اطلاعاتی در یک خط زمانی قابل ردیابی.</p>
      {rows.length===0?<Empty/>:<div className="report-table"><table><thead><tr><th>جریان</th><th>نوع</th><th>عنوان</th><th>جزئیات</th><th>مقدار/وزن</th><th>مبلغ</th><th>دلیل/وضعیت</th><th>زمان شمسی</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{flowLabels[x.flow]||x.flow}</td><td>{kindLabels[x.type]||activityLabel[x.type]||'عملیات'}</td><td>{x.title}</td><td>{x.detail||'-'}</td><td>{x.quantity==null?'-':formatNumber(x.quantity)}</td><td>{x.amount==null?'-':formatToman(x.amount)}</td><td className="wrap-cell">{shiftStatusLabel[x.reason]||x.reason||'-'}</td><td>{formatJalaliDateTime(x.occurredAt)}</td></tr>)}</tbody></table></div>}
    </div>
  </Page>
}
