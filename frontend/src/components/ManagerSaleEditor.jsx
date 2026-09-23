import {useEffect,useState} from 'react';
import api from '../services/api';import NumericInput from './NumericInput';
import {formatJalaliDateTime} from '../utils/jalali';import {formatToman,formatNumber,toNumber} from '../utils/fa';
export default function ManagerSaleEditor({saleId,products=[],onClose,onSaved}){
 const [record,setRecord]=useState(null),[form,setForm]=useState(null),[history,setHistory]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;setRecord(null);setForm(null);setError('');Promise.all([api.get(`/sales/${saleId}`),api.get(`/sales/${saleId}/edits`)]).then(([a,b])=>{
 if(!alive)return;setRecord(a.data);setHistory(b.data);
 setForm({items:a.data.items.map(x=>({productId:x.productId,quantity:String(x.quantity)})),customerPayableAmount:String(a.data.totalAmount),paymentAmount:String(a.data.paymentAmount),paymentMethod:a.data.paymentMethod||'CARD',note:a.data.note||'',reason:''});
 }).catch(e=>{if(alive)setError(e.response?.data?.message||e.message)});return()=>{alive=false}},[saleId]);
 function changeItem(index,key,value){setForm(v=>({...v,items:v.items.map((x,i)=>i===index?{...x,[key]:value}:x)}))}
 const prices=new Map(products.map(x=>[x.id,x.price]));
 const subtotal=form?.items.reduce((sum,x)=>{
 const original=record?.items?.find(it=>it.productId===x.productId);
 return sum+toNumber(x.quantity)*Number(original?.unitPrice??prices.get(x.productId)??0)
 },0)||0;
 async function save(e){e.preventDefault();setError('');if(!confirm('اصلاح این فاکتور بر انبار، فروش و حساب مشتری تأثیر می‌گذارد. ادامه می‌دهید؟'))return;
 try{setBusy(true);await api.put(`/sales/${saleId}`,{...form,
  items:form.items.map(x=>({productId:x.productId,quantity:toNumber(x.quantity)})),
  customerPayableAmount:toNumber(form.customerPayableAmount),paymentAmount:toNumber(form.paymentAmount),paymentType:record.paymentType});
 await onSaved?.();}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
 return <div className="panel manager-sale-editor"><h3>اصلاح فاکتور توسط مدیر</h3>
 {error&&<p role="alert" className="field-error">{error}</p>}
 {!form?<p>در حال بارگذاری فاکتور…</p>:<><p>زمان اصلی ثبت: {formatJalaliDateTime(record.soldAt)} | شناسه فاکتور: <code dir="ltr">{record.id}</code></p>
 <p className="hint">تاریخ اصلی فروش حفظ می‌شود؛ هر اصلاح با نام مدیر، علت و نسخه قبل و بعد ثبت خواهد شد. اگر فاکتور مرجوع شده باشد یا اصلاح بدهی را منفی کند، سرور ثبت را رد می‌کند.</p>
 {record.status!=='ACTIVE'&&<p className="field-error">فاکتور مرجوع یا باطل شده و امکان اصلاح مستقیم ندارد.</p>}
 <form className="form-grid" onSubmit={save}>
 {form.items.map((x,i)=><div className="sale-line wide" key={i}><span>قلم {i+1}</span><select value={x.productId} onChange={e=>changeItem(i,'productId',e.target.value)} required><option value="">انتخاب محصول</option>{products.filter(p=>p.isActive||p.id===x.productId).map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select><NumericInput required inputMode="numeric" value={x.quantity} onChange={e=>changeItem(i,'quantity',e.target.value)}/><button type="button" className="small danger" disabled={form.items.length===1} onClick={()=>setForm(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))}>حذف</button></div>)}
 <button type="button" className="ghost wide" onClick={()=>setForm(v=>({...v,items:[...v.items,{productId:'',quantity:''}]}))}>افزودن قلم</button>
 <p className="wide hint">جمع اقلام با قیمت ثبت‌شده قبلی یا قیمت فعلی محصول جدید: {formatToman(subtotal)}</p>
 <label>مبلغ نهایی فروش (تومان)<NumericInput required inputMode="numeric" value={form.customerPayableAmount} onChange={e=>setForm({...form,customerPayableAmount:e.target.value})}/></label>
 {record.customerId&&<label>پیش‌پرداخت اولیه فاکتور (تومان)<NumericInput inputMode="numeric" value={form.paymentAmount} onChange={e=>setForm({...form,paymentAmount:e.target.value})}/></label>}
 <label className="wide">توضیحات فاکتور<input value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
 <label className="wide">علت اصلاح (اجباری؛ حداقل ۵ حرف)<textarea required minLength={5} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
 <button disabled={busy||record.status!=='ACTIVE'}>{busy?'در حال اصلاح…':'ثبت اصلاح فاکتور'}</button><button type="button" className="ghost" onClick={onClose}>انصراف</button>
 </form>
 <h4>تاریخچه اصلاحات</h4>{history.length?<table><thead><tr><th>زمان</th><th>علت</th><th>مدیر</th></tr></thead><tbody>{history.map(x=><tr key={x.id}><td>{formatJalaliDateTime(x.edited_at)}</td><td>{x.reason}</td><td>{x.users?.full_name||'-'}</td></tr>)}</tbody></table>:<p className="hint">اصلاحی ثبت نشده است.</p>}
 </>}</div>;
}
