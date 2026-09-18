import {useEffect,useMemo,useState} from 'react';
import api from '../services/api';
import {Page,ErrorBox} from '../components/Ui';

const emptySale={customerId:'',paymentType:'CASH',paymentAmount:'',discountAmount:'',note:'',items:[{productId:'',quantity:1}]};

export default function OperatorPanel(){
  const [mode,setMode]=useState('start');
  const [products,setProducts]=useState([]);const [customers,setCustomers]=useState([]);const [status,setStatus]=useState(null);
  const [error,setError]=useState(null);const [ok,setOk]=useState('');const [busy,setBusy]=useState(false);
  const [start,setStart]=useState({productId:'',counterStart:'',note:''});
  const [end,setEnd]=useState({defects:'',note:''});
  const [sale,setSale]=useState(emptySale);
  const [newCustomer,setNewCustomer]=useState({name:'',phone:''});
  async function load(){try{setError(null);const [p,c,s]=await Promise.all([api.get('/products'),api.get('/customers'),api.get('/production/status')]);setProducts(p.data.filter(x=>x.isActive));setCustomers(c.data.filter(x=>x.isActive));setStatus(s.data)}catch(e){setError(e)}}
  useEffect(()=>{load()},[]);
  async function run(fn,msg){setBusy(true);setError(null);setOk('');try{await fn();setOk(msg);await load()}catch(e){setError(e)}finally{setBusy(false)}}
  async function submitStart(e){e.preventDefault();run(()=>api.post('/production/start',{...start,counterStart:Number(start.counterStart)}),'کانتر شروع شیفت ثبت شد.');}
  async function submitEnd(e){e.preventDefault();run(()=>api.post('/production/end',{...end,defects:Number(end.defects)}),'تعداد معیوب ثبت شد. تولید پس از دریافت کانتر شیفت بعد نهایی می‌شود.');}
  function setItem(i,key,val){const items=sale.items.map((x,j)=>j===i?{...x,[key]:val}:x);setSale({...sale,items})}
  function addItem(){if(sale.items.length<2)setSale({...sale,items:[...sale.items,{productId:'',quantity:1}]})}
  const subtotal=useMemo(()=>sale.items.reduce((sum,it)=>{const p=products.find(x=>x.id===it.productId);return sum+Number(p?.price||0)*Number(it.quantity||0)},0),[sale.items,products]);
  const finalTotal=Math.max(0,subtotal-Number(sale.discountAmount||0));
  async function createCustomer(){if(!newCustomer.name.trim())return;try{const r=await api.post('/customers',newCustomer);setCustomers(v=>[...v,r.data]);setSale(v=>({...v,customerId:r.data.id}));setNewCustomer({name:'',phone:''});setOk('مشتری جدید ثبت و انتخاب شد.')}catch(e){setError(e)}}
  async function submitSale(e){e.preventDefault();run(async()=>{const payload={...sale,discountAmount:Number(sale.discountAmount||0),paymentAmount:sale.paymentAmount===''?undefined:Number(sale.paymentAmount),items:sale.items.map(x=>({productId:x.productId,quantity:Number(x.quantity)}))};await api.post('/sales',payload);setSale(emptySale)},'فروش با موفقیت ثبت شد.');}
  return <Page title="پنل عملیات اپراتور">
    <ErrorBox error={error}/>{ok&&<div className="success">{ok}</div>}
    <div className="operator-status panel"><b>وضعیت شیفت:</b> {status?<span>{status.shiftName} — {status.productName} — کانتر شروع {Number(status.startCounter).toLocaleString('fa-IR')} — {status.status}</span>:<span>شیفت باز ثبت‌شده‌ای ندارید.</span>}</div>
    <div className="operator-actions">
      <button className={mode==='start'?'active-action':'ghost'} onClick={()=>setMode('start')}>شروع شیفت / کانتر</button>
      <button className={mode==='end'?'active-action':'ghost'} onClick={()=>setMode('end')}>پایان شیفت / معیوب</button>
      <button className={mode==='sale'?'active-action':'ghost'} onClick={()=>setMode('sale')}>ثبت فروش</button>
    </div>
    {mode==='start'&&<form className="panel operator-form" onSubmit={submitStart}><h3>شروع شیفت و ثبت کانتر</h3><label>نوع محصول<select required value={start.productId} onChange={e=>setStart({...start,productId:e.target.value})}><option value="">انتخاب کنید</option>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>عدد فعلی کانتر دستگاه<input required inputMode="numeric" type="number" min="0" step="1" value={start.counterStart} onChange={e=>setStart({...start,counterStart:e.target.value})}/></label><label>توضیح اختیاری<textarea value={start.note} onChange={e=>setStart({...start,note:e.target.value})}/></label><button disabled={busy}>ثبت شروع شیفت</button></form>}
    {mode==='end'&&<form className="panel operator-form" onSubmit={submitEnd}><h3>پایان شیفت و ثبت معیوب</h3><label>تعداد سبد معیوب<input required inputMode="numeric" type="number" min="0" step="1" value={end.defects} onChange={e=>setEnd({...end,defects:e.target.value})}/></label><label>توضیح اختیاری<textarea value={end.note} onChange={e=>setEnd({...end,note:e.target.value})}/></label><button disabled={busy}>ثبت معیوب</button></form>}
    {mode==='sale'&&<form className="panel operator-form" onSubmit={submitSale}><h3>ثبت فروش</h3><label>مشتری<select required value={sale.customerId} onChange={e=>setSale({...sale,customerId:e.target.value})}><option value="">انتخاب مشتری</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?` — ${x.phone}`:''}</option>)}</select></label><div className="new-customer-box"><b>مشتری جدید</b><input placeholder="نام مشتری" value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer,name:e.target.value})}/><input placeholder="شماره موبایل" inputMode="tel" value={newCustomer.phone} onChange={e=>setNewCustomer({...newCustomer,phone:e.target.value})}/><button type="button" className="ghost" onClick={createCustomer}>ثبت مشتری</button></div><h4>اقلام فروش</h4>{sale.items.map((it,i)=><div className="sale-line" key={i}><select required value={it.productId} onChange={e=>setItem(i,'productId',e.target.value)}><option value="">محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><input required type="number" min="1" step="1" value={it.quantity} onChange={e=>setItem(i,'quantity',e.target.value)}/>{sale.items.length>1&&<button type="button" className="small danger" onClick={()=>setSale({...sale,items:sale.items.filter((_,j)=>j!==i)})}>حذف</button>}</div>)}{sale.items.length<2&&<button type="button" className="ghost" onClick={addItem}>+ محصول دوم</button>}<label>تخفیف<input type="number" min="0" max={subtotal} value={sale.discountAmount} onChange={e=>setSale({...sale,discountAmount:e.target.value})}/></label><label>نوع پرداخت<select value={sale.paymentType} onChange={e=>setSale({...sale,paymentType:e.target.value,paymentAmount:''})}><option value="CASH">نقدی</option><option value="CARD">کارت / انتقال</option><option value="CREDIT">نسیه</option><option value="MIXED">ترکیبی</option></select></label>{sale.paymentType==='MIXED'&&<label>مبلغ پرداخت‌شده<input required type="number" min="1" max={Math.max(1,finalTotal-1)} value={sale.paymentAmount} onChange={e=>setSale({...sale,paymentAmount:e.target.value})}/></label>}<div className="sale-total">جمع تقریبی: <b>{finalTotal.toLocaleString('fa-IR')}</b></div><label>توضیح<textarea value={sale.note} onChange={e=>setSale({...sale,note:e.target.value})}/></label><button disabled={busy}>ثبت فروش</button></form>}
  </Page>;
}
