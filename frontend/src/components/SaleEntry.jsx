import {useEffect,useMemo,useState} from 'react';
import api from '../services/api';
import {formatToman,normalizeDigits,toNumber} from '../utils/fa';

const baseSale={customerId:'',paymentType:'CASH',paymentAmount:'',paymentMethod:'CARD',customerPayableAmount:'',driverName:'',driverPhone:'',driverVehicle:'',note:'',items:[{productId:'',quantity:'1'}]};

export default function SaleEntry({products,customers,setCustomers,onSaved,busy,setBusy,setError,setOk}){
  const [sale,setSale]=useState(baseSale);
  const [newCustomer,setNewCustomer]=useState({name:'',phone:'',address:''});
  const [manualTotal,setManualTotal]=useState(false);
  const isCredit=sale.paymentType==='CREDIT';
  const subtotal=useMemo(()=>sale.items.reduce((sum,it)=>{const p=products.find(x=>x.id===it.productId);return sum+Number(p?.price||0)*toNumber(it.quantity)},0),[sale.items,products]);
  useEffect(()=>{if(!manualTotal)setSale(v=>({...v,customerPayableAmount:String(subtotal)}))},[subtotal,manualTotal]);
  const finalTotal=Math.max(0,toNumber(sale.customerPayableAmount));
  const discount=Math.max(0,subtotal-finalTotal);
  function setItem(i,key,val){setSale(v=>({...v,items:v.items.map((x,j)=>j===i?{...x,[key]:val}:x)}))}
  function addItem(){setSale(v=>({...v,items:[...v.items,{productId:'',quantity:'1'}]}))}
  function removeItem(i){setSale(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))}
  async function createCustomer(){
    if(!newCustomer.name.trim()||!newCustomer.phone.trim()){setError?.(new Error('نام و شماره تماس مشتری نسیه جدید الزامی است.'));return}
    try{const r=await api.post('/customers',{...newCustomer,phone:normalizeDigits(newCustomer.phone)});setCustomers?.(v=>[...v,r.data]);setSale(v=>({...v,customerId:r.data.id}));setNewCustomer({name:'',phone:'',address:''});setOk?.('مشتری نسیه ثبت و انتخاب شد.')}catch(e){setError?.(e)}
  }
  async function submit(e){
    e.preventDefault();setError?.(null);setOk?.('');setBusy?.(true);
    try{
      if(isCredit&&!sale.customerId)throw new Error('برای فروش نسیه مشتری را انتخاب یا ثبت کنید.');
      if(finalTotal>subtotal)throw new Error('مبلغ نهایی فروش نمی‌تواند بیشتر از مبلغ محاسبه‌شده باشد.');
      const plate=normalizeDigits(sale.driverVehicle.trim());
      if(plate&&!/^\d{2}\s*[آ-ی]\s*\d{3}\s*-\s*\d{2}$/.test(plate))throw new Error('فرمت پلاک صحیح نیست. نمونه: 16 ل 785 - 49');
      const payload={paymentType:sale.paymentType,customerId:isCredit?sale.customerId:undefined,paymentAmount:isCredit?toNumber(sale.paymentAmount):undefined,paymentMethod:isCredit&&toNumber(sale.paymentAmount)>0?sale.paymentMethod:undefined,customerPayableAmount:finalTotal,driverName:sale.driverName.trim()||undefined,driverPhone:normalizeDigits(sale.driverPhone.trim())||undefined,driverVehicle:plate||undefined,note:sale.note.trim()||undefined,items:sale.items.map(x=>({productId:x.productId,quantity:toNumber(x.quantity)}))};
      await api.post('/sales',payload);setSale(baseSale);setManualTotal(false);setOk?.('فروش با موفقیت ثبت شد. تاریخ و ساعت به‌صورت خودکار ثبت شد.');await onSaved?.();
    }catch(e){setError?.(e)}finally{setBusy?.(false)}
  }
  return <form className="panel operator-form" onSubmit={submit}>
    <h3>ثبت فروش</h3>
    <div className="form-grid">
      <label>نوع پرداخت<select value={sale.paymentType} onChange={e=>setSale({...sale,paymentType:e.target.value,customerId:'',paymentAmount:''})}><option value="CASH">نقدی</option><option value="CARD">کارت / انتقال بانکی</option><option value="CREDIT">نسیه</option></select></label>
      <div className="auto-time-note">تاریخ و ساعت فروش به‌صورت خودکار توسط سیستم ثبت می‌شود.</div>
    </div>
    {isCredit&&<div className="credit-box">
      <label>مشتری نسیه<select required value={sale.customerId} onChange={e=>setSale({...sale,customerId:e.target.value})}><option value="">انتخاب مشتری</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?` — ${x.phone}`:''}</option>)}</select></label>
      <div className="new-customer-box"><b>مشتری نسیه جدید</b><input placeholder="نام مشتری" value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer,name:e.target.value})}/><input placeholder="شماره تماس" inputMode="numeric" value={newCustomer.phone} onChange={e=>setNewCustomer({...newCustomer,phone:e.target.value})}/><button type="button" className="ghost" onClick={createCustomer}>ثبت مشتری</button></div>
      <div className="form-grid"><label>پیش‌پرداخت (اختیاری)<input type="text" inputMode="numeric" value={sale.paymentAmount} onChange={e=>setSale({...sale,paymentAmount:e.target.value})}/></label>{toNumber(sale.paymentAmount)>0&&<label>روش پیش‌پرداخت<select value={sale.paymentMethod} onChange={e=>setSale({...sale,paymentMethod:e.target.value})}><option value="CASH">نقدی</option><option value="CARD">کارت</option><option value="BANK_TRANSFER">انتقال بانکی</option><option value="CHECK">چک</option><option value="OTHER">سایر</option></select></label>}<div className="debt-preview">مانده نسیه پس از ثبت: <b>{formatToman(Math.max(0,finalTotal-toNumber(sale.paymentAmount)))}</b></div></div>
    </div>}
    <h4>اقلام فروش</h4>
    {sale.items.map((it,i)=><div className="sale-line" key={i}><select required value={it.productId} onChange={e=>setItem(i,'productId',e.target.value)}><option value="">انتخاب محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {formatToman(x.price)}</option>)}</select><input required type="text" inputMode="numeric" value={it.quantity} onChange={e=>setItem(i,'quantity',e.target.value)}/>{sale.items.length>1&&<button type="button" className="small danger" onClick={()=>removeItem(i)}>حذف</button>}</div>)}
    <button type="button" className="ghost" onClick={addItem}>افزودن قلم دیگر</button>
    <div className="sale-total"><div>مبلغ محاسبه‌شده: <b>{formatToman(subtotal)}</b></div><label>مبلغ نهایی فروش به مشتری<input type="text" inputMode="numeric" value={sale.customerPayableAmount} onChange={e=>{setManualTotal(true);setSale({...sale,customerPayableAmount:e.target.value})}}/></label><div>تخفیف محاسبه‌شده: <b>{formatToman(discount)}</b></div></div>
    <div className="driver-box"><h4>اطلاعات راننده (اختیاری)</h4><div className="form-grid"><label>نام راننده<input value={sale.driverName} onChange={e=>setSale({...sale,driverName:e.target.value})}/></label><label>شماره تماس<input inputMode="numeric" value={sale.driverPhone} onChange={e=>setSale({...sale,driverPhone:e.target.value})}/></label><label>پلاک خودرو<input placeholder="16 ل 785 - 49" value={sale.driverVehicle} onChange={e=>setSale({...sale,driverVehicle:e.target.value})}/></label></div></div>
    <label>توضیحات<textarea value={sale.note} onChange={e=>setSale({...sale,note:e.target.value})}/></label>
    <button disabled={busy}>{busy?'در حال ثبت فروش…':'ثبت فروش'}</button>
  </form>
}
