import {useEffect,useState} from 'react';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import {formatJalaliDateTime,formatGregorianDateString} from '../utils/jalali';

const statusLabel={ACTIVE:'فعال',AWAITING_NEXT_COUNTER:'منتظر کانتر شیفت بعد',AWAITING_DEFECTS:'منتظر ثبت معیوب',FINALIZED:'نهایی‌شده'};
const shiftLabel={MORNING:'صبح',EVENING:'عصر',NIGHT:'شب'};
const shortShift=x=>shiftLabel[x]||String(x||'').replace(/^شیفت\s*/,'')||'-';
const cleaningMark=x=>x.cleaningZone==null?'—':x.cleaningDone?'🟢':'🟠';
const cleaningText=x=>x.cleaningZone==null?'چرخه نظافت برای این رکورد فعال نبوده است':x.cleaningDone?'نظافت تأیید شده است':'نظافت تأیید نشده است';

export default function Production(){
 const[runs,setRuns]=useState([]),[records,setRecords]=useState([]),[error,setError]=useState(null);
 async function load(){try{setError(null);const[a,b]=await Promise.all([api.get('/production/runs'),api.get('/production')]);setRuns(a.data);setRecords(b.data)}catch(e){setError(e)}}
 useEffect(()=>{load()},[]);
 return <Page title="تولید و شیفت‌ها" actions={<button onClick={load}>بروزرسانی</button>}><ErrorBox error={error}/>
  <div className="panel"><h3>گردش شیفت‌ها و کانتر دستگاه</h3>{runs.length===0?<Empty/>:<div className="report-table production-table-scroll"><table className="production-table"><thead><tr><th>تاریخ شیفت</th><th>شیفت</th><th>اپراتور</th><th>کد</th><th>کانتر شروع</th><th>کانتر پایان</th><th>کل</th><th>معیوب</th><th>سالم</th><th>نظافت</th><th>وضعیت</th></tr></thead><tbody>{runs.map(x=><tr key={x.id}><td>{formatGregorianDateString(x.shiftDate)}</td><td>{shortShift(x.shiftCode||x.shiftName)}</td><td>{x.operatorName}</td><td>{x.productCode||'-'}</td><td>{x.startCounter}</td><td>{x.endCounter??'-'}</td><td>{x.grossQuantity??'-'}</td><td>{x.defects??'-'}</td><td>{x.goodQuantity??'-'}</td><td className="cleaning-status" title={cleaningText(x)} aria-label={cleaningText(x)}>{cleaningMark(x)}</td><td>{statusLabel[x.status]||x.status}</td></tr>)}</tbody></table></div>}</div>
  <div className="panel"><h3>تولید نهایی‌شده و اضافه‌شده به موجودی</h3>{records.length===0?<Empty/>:<div className="report-table production-table-scroll"><table className="production-table"><thead><tr><th>کد</th><th>تولید کل</th><th>معیوب</th><th>تولید سالم</th><th>شیفت</th><th>اپراتور</th><th>نظافت</th><th>زمان</th></tr></thead><tbody>{records.map(x=><tr key={x.id}><td>{x.productCode||'-'}</td><td>{x.grossQuantity}</td><td>{x.defects}</td><td>{x.quantity}</td><td>{shortShift(x.shift)}</td><td>{x.operatorName}</td><td className="cleaning-status" title={cleaningText(x)} aria-label={cleaningText(x)}>{cleaningMark(x)}</td><td>{formatJalaliDateTime(x.productionAt)}</td></tr>)}</tbody></table></div>}</div>
 </Page>;
}
