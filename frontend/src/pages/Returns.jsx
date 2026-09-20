import NumericInput from '../components/NumericInput';
import JalaliDateInput,{validateJalaliRange} from '../components/JalaliDateInput';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import {formatJalaliDateTime} from '../utils/jalali';
import {formatToman,toNumber} from '../utils/fa';

export default function Returns(){
  const [params]=useSearchParams();
  const [sales,setSales]=useState([]),[saleId,setSaleId]=useState(''),[detail,setDetail]=useState(null);
  const [q,setQ]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const [searchBusy,setSearchBusy]=useState(false),[type,setType]=useState('RETURN'),[qty,setQty]=useState({}),[refund,setRefund]=useState(''),[note,setNote]=useState('');
  const [history,setHistory]=useState([]),[error,setError]=useState(null),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
  async function searchSales(filters={}){
    setSearchBusy(true);setError(null);
    try{
      const data=(await api.get('/sales',{params:filters})).data;
      setSales(data.filter(x=>!['CANCELLED','RETURNED'].includes(x.status)));
    }catch(e){setError(e)}finally{setSearchBusy(false)}
  }
  async function loadHistory(){try{setHistory((await api.get('/returns')).data)}catch(e){setError(e)}}
  useEffect(()=>{
    searchSales();loadHistory();
    const linkedId=params.get('saleId');
    if(linkedId&&/^[0-9a-f-]{36}$/i.test(linkedId))choose(linkedId);
  },[]);
  async function applySearch(e){e.preventDefault();try{
    const dates=validateJalaliRange(from,to);await searchSales({q:q.trim()||undefined,...dates});
  }catch(err){setError(err)}}
  async function choose(id){
    setSaleId(id);setQty({});setDetail(null);setError(null);
    if(!id)return;
    try{setDetail((await api.get(`/sales/${id}`)).data)}catch(e){setError(e)}
  }
  async function submit(e){e.preventDefault();if(busy)return;setError(null);setOk('');setBusy(true);
    try{
      const items=type==='RETURN'?(detail?.items||[]).filter(x=>toNumber(qty[x.id])>0).map(x=>({saleItemId:x.id,quantity:toNumber(qty[x.id])})):undefined;
      if(type==='RETURN'&&!items.length)throw new Error('حداقل یک قلم مرجوعی وارد کنید.');
      await api.post('/returns',{saleId,returnType:type,items,refundAmount:toNumber(refund),note});
      setOk(type==='CANCEL'?'فروش با ثبت سابقه ابطال شد و موجودی و حساب آن اصلاح شد.':'مرجوعی ثبت شد و موجودی و حساب آن اصلاح شد.');
      setSaleId('');setDetail(null);setQty({});setRefund('');setNote('');
      await Promise.all([searchSales({q:q.trim()||undefined,...validateJalaliRange(from,to)}),loadHistory()]);
    }catch(e){setError(e)}finally{setBusy(false)}
  }
  return <Page title="مرجوعی / ابطال فروش"><ErrorBox error={error}/>{ok&&<div className="success">{ok}</div>}
    <form className="panel" onSubmit={applySearch}><h3>پیدا کردن فروش</h3>
      <div className="form-grid">
        <label>نام مشتری، شماره تماس یا شناسه فاکتور<input value={q} placeholder="جستجوی فاکتور" onChange={e=>setQ(e.target.value)}/></label>
        <JalaliDateInput label="از تاریخ فروش" value={from} onChange={setFrom}/>
        <JalaliDateInput label="تا تاریخ فروش" value={to} onChange={setTo}/>
        <button disabled={searchBusy}>{searchBusy?'در حال جستجو…':'جستجوی فروش'}</button>
        <button type="button" className="ghost" onClick={()=>{setQ('');setFrom('');setTo('');searchSales()}}>نمایش جدیدترین‌ها</button>
      </div><small className="hint">۱۵۰ فاکتور تازه‌ترِ مطابق فیلتر نمایش داده می‌شود؛ برای موارد قدیمی‌تر بازه تاریخ را محدود کنید.</small>
    </form>
    <form className="panel" onSubmit={submit}><div className="form-grid"><label>فروش
      <select required value={saleId} onChange={e=>choose(e.target.value)}><option value="">انتخاب فروش</option>{sales.map(x=><option key={x.id} value={x.id}>{formatJalaliDateTime(x.soldAt)} — {x.customerName||'نقدی'} — {formatToman(x.netTotal)} — {x.id.slice(0,8)}</option>)}</select></label>
      <label>نوع عملیات<select value={type} onChange={e=>setType(e.target.value)}><option value="RETURN">مرجوعی بخشی از فروش</option><option value="CANCEL">ابطال کل فروش</option></select></label>
      <label>مبلغ بازپرداخت به مشتری (تومان)<NumericInput inputMode="numeric" value={refund} onChange={e=>setRefund(e.target.value)}/></label>
    </div>
    {detail&&<div className="sale-choice-summary">فاکتور انتخاب‌شده: {formatJalaliDateTime(detail.soldAt)} — {detail.customerName||'نقدی'} — {formatToman(detail.netTotal)} — کد {detail.id.slice(0,8)}</div>}
    {detail&&type==='RETURN'&&<div className="return-items"><h4>اقلام مرجوعی</h4>{detail.items.map(x=><div className="return-line" key={x.id}><span>{x.productName} — فروخته‌شده {x.quantity} — قبلاً مرجوع {x.returnedQuantity}</span><NumericInput inputMode="numeric" placeholder="تعداد مرجوع" value={qty[x.id]||''} onChange={e=>setQty(v=>({...v,[x.id]:e.target.value}))}/></div>)}</div>}
    {detail&&type==='CANCEL'&&<div className="warning">با ابطال، باقی‌مانده اقلام این فاکتور به انبار برمی‌گردد و بدهی مشتری اصلاح می‌شود. سابقه ابطال نگهداری می‌شود.</div>}
    <div className="form-grid"><label className="wide">توضیحات<textarea value={note} onChange={e=>setNote(e.target.value)}/></label></div>
    <button disabled={!detail||busy}>{busy?'در حال ثبت…':'ثبت عملیات'}</button></form>
    <div className="panel"><h3>سوابق مرجوعی و ابطال</h3>{history.length===0?<Empty/>:<div className="report-table"><table><thead><tr><th>نوع</th><th>مشتری</th><th>کاهش مبلغ فروش</th><th>بازپرداخت</th><th>تاریخ</th></tr></thead><tbody>{history.map(x=><tr key={x.id}><td>{x.returnType==='CANCEL'?'ابطال':'مرجوعی'}</td><td>{x.customerName||'نقدی'}</td><td>{formatToman(x.amountReduction)}</td><td>{formatToman(x.refundAmount)}</td><td>{formatJalaliDateTime(x.returnedAt)}</td></tr>)}</tbody></table></div>}</div>
  </Page>
}
