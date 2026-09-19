import {useMemo,useState} from 'react';
import api from '../services/api';

const emptySale={customerId:'',paymentType:'CASH',paymentAmount:'',paymentMethod:'CARD',discountAmount:'',driverName:'',driverPhone:'',driverVehicle:'',note:'',items:[{productId:'',quantity:1}]};

export default function SaleEntry({products,customers,setCustomers,onSaved,busy,setBusy,setError,setOk}){
  const [sale,setSale]=useState(emptySale);
  const [newCustomer,setNewCustomer]=useState({name:'',phone:'',address:''});
  const isCredit=sale.paymentType==='CREDIT';
  const subtotal=useMemo(()=>sale.items.reduce((sum,it)=>{const p=products.find(x=>x.id===it.productId);return sum+Number(p?.price||0)*Number(it.quantity||0)},0),[sale.items,products]);
  const finalTotal=Math.max(0,subtotal-Number(sale.discountAmount||0));
  function setItem(i,key,val){setSale(v=>({...v,items:v.items.map((x,j)=>j===i?{...x,[key]:val}:x)}))}
  function addItem(){setSale(v=>({...v,items:[...v.items,{productId:'',quantity:1}]}))}
  function removeItem(i){setSale(v=>({...v,items:v.items.filter((_,j)=>j!==i)}))}
  async function createCustomer(){
    if(!newCustomer.name.trim()||!newCustomer.phone.trim()){setError?.(new Error('نام و شماره تماس مشتری نسیه الزامی است'));return}
    try{const r=await api.post('/customers',newCustomer);setCustomers?.(v=>[...v,r.data]);setSale(v=>({...v,customerId:r.data.id}));setNewCustomer({name:'',phone:'',address:''});setOk?.('مشتری نسیه ثبت و انتخاب شد.')}catch(e){setError?.(e)}
  }
  async function submit(e){
    e.preventDefault();setError?.(null);setOk?.('');setBusy?.(true);
    try{
      if(isCredit&&!sale.customerId)throw new Error('برای فروش نسیه مشتری را انتخاب یا ثبت کنید.');
      if(sale.driverVehicle.trim()&&!/^[۰-۹0-9]{2}\s*[آ-یA-Za-z]\s*[۰-۹0-9]{3}\s*-\s*[۰-۹0-9]{2}$/.test(sale.driverVehicle.trim()))throw new Error('فرمت پلاک صحیح نیست. نمونه: 16 ل 785 - 49');
      const payload={paymentType:sale.paymentType,customerId:isCredit?sale.customerId:undefined,paymentAmount:isCredit?Number(sale.paymentAmount||0):undefined,paymentMethod:isCredit&&Number(sale.paymentAmount||0)>0?sale.paymentMethod:undefined,discountAmount:Number(sale.discountAmount||0),driverName:sale.driverName.trim()||undefined,driverPhone:sale.driverPhone.trim()||undefined,driverVehicle:sale.driverVehicle.trim()||undefined,note:sale.note.trim()||undefined,items:sale.items.map(x=>({productId:x.productId,quantity:Number(x.quantity)}))};
      await api.post('/sales',payload);setSale(emptySale);setOk?.('فروش با موفقیت ثبت شد. تاریخ و ساعت به‌صورت خودکار توسط سیستم ثبت شد.');await onSaved?.();
    }catch(e){setError?.(e)}finally{setBusy?.(false)}
  }
  return <form className="panel operator-form" onSubmit={submit}>
    <h3>ثبت فروش</h3>
    <div className="form-grid">
      <label>نوع پرداخت<select value={sale.paymentType} onChange={e=>setSale({...sale,paymentType:e.target.value,customerId:'',paymentAmount:''})}><option value="CASH">نقدی</option><option value="CARD">کارت / انتقال بانکی</option><option value="CREDIT">نسیه</option></select></label>
      <label>تخفیف<input type="number" min="0" max={subtotal} value={sale.discountAmount} onChange={e=>setSale({...sale,discountAmount:e.target.value})}/></label>
      <div className="auto-time-note">تاریخ و ساعت فروش توسط سیستم ثبت می‌شود.</div>
    </div>
    {isCredit&&<div className="credit-box">
      <label>مشتری نسیه<select required value={sale.customerId} onChange={e=>setSale({...sale,customerId:e.target.value})}><option value="">انتخاب مشتری</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?` — ${x.phone}`:''}</option>)}</select></label>
      <div className="new-customer-box"><b>مشتری نسیه جدید</b><input placeholder="نام مشتری" value={newCustomer.name} onChange={e=>setNewCustomer({...newCustomer,name:e.target.value})}/><input required placeholder="شماره موبایل" inputMode="tel" value={newCustomer.phone} onChange={e=>setNewCustomer({...newCustomer,phone:e.target.value})}/><button type="button" className="ghost" onClick={createCustomer}>ثبت مشتری</button></div>
      <div className="form-grid"><label>پیش‌پرداخت (اختیاری)<input type="number" min="0" max={Math.max(0,finalTotal-1)} value={sale.paymentAmount} onChange={e=>setSale({...sale,paymentAmount:e.target.value})}/></label>{Number(sale.paymentAmount||0)>0&&<label>روش پیش‌پرداخت<select value={sale.paymentMethod} onChange={e=>setSale({...sale,paymentMethod:e.target.value})}><option value="CASH">نقدی</option><option value="CARD">کارت</option><option value="BANK_TRANSFER">انتقال بانکی</option><option value="CHECK">چک</option><option value="OTHER">سایر</option></select></label>}<div className="debt-preview">مانده نسیه پس از ثبت: <b>{Math.max(0,finalTotal-Number(sale.paymentAmount||0)).toLocaleString('fa-IR')}</b></div></div>
    </div>}
    <h4>اقلام فروش</h4>
    {sale.items.map((it,i)=><div className="sale-line" key={i}><select required value={it.productId} onChange={e=>setItem(i,'productId',e.target.value)}><option value="">محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {Number(x.price).toLocaleString('fa-IR')}</option>)}</select><input required type="number" min="1" step="1" value={it.quantity} onChange={e=>setItem(i,'quantity',e.target.value)}/>{sale.items.length>1&&<button type="button" className="small danger" onClick={()=>removeItem(i)}>حذف</button>}</div>)}
    <button type="button" className="ghost" onClick={addItem}>+ قلم جدید</button>
    <div className="sale-total">جمع قبل از تخفیف: <b>{subtotal.toLocaleString('fa-IR')}</b> — مبلغ نهایی: <b>{finalTotal.toLocaleString('fa-IR')}</b></div>
    <div className="driver-box"><h4>اطلاعات راننده (اختیاری)</h4><div className="form-grid"><label>نام راننده<input value={sale.driverName} onChange={e=>setSale({...sale,driverName:e.target.value})}/></label><label>شماره تماس<input inputMode="tel" value={sale.driverPhone} onChange={e=>setSale({...sale,driverPhone:e.target.value})}/></label><label>پلاک خودرو<input placeholder="16 ل 785 - 49" value={sale.driverVehicle} onChange={e=>setSale({...sale,driverVehicle:e.target.value})}/></label></div></div>
    <label>توضیح<textarea value={sale.note} onChange={e=>setSale({...sale,note:e.target.value})}/></label>
    <button disabled={busy}>ثبت فروش</button>
  </form>
}
