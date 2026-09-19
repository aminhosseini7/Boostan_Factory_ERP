import {appendSaleItem,removeSaleItem} from '../utils/saleItems';
import {useEffect,useMemo,useRef,useState} from 'react';
import api from '../services/api';
import {formatToman,normalizeDigits,toNumber} from '../utils/fa';
import NumericInput from './NumericInput';
import IranPlateInput, {plateToString,isCompletePlate} from './IranPlateInput';

const firstItem=()=>({id:'item-0',productId:'',quantity:''});
const blankSale=()=>({customerId:'',paymentType:'CASH',paymentAmount:'',paymentMethod:'CARD',customerPayableAmount:'',driverName:'',driverPhone:'',note:'',items:[firstItem()]});
const blankPlate=()=>({first:'',letter:'',middle:'',city:''});
const cleanPhone=v=>normalizeDigits(v).replace(/\D/g,'').slice(0,11);
const phoneValid=v=>/^\d{11}$/.test(cleanPhone(v));
const showError=(errors,key)=>(errors[key]?<small className="field-error" role="alert">{errors[key]}</small>:null);
function detectServerField(text=''){
  if(/پلاک|plate/i.test(text))return 'plate';
  if(/راننده.*تماس|driver.*phone/i.test(text))return 'driverPhone';
  if(/مشتری|customer/i.test(text))return 'customerId';
  if(/پیش.?پرداخت|payment amount|پرداخت.*معتبر/i.test(text))return 'paymentAmount';
  if(/تخفیف|مبلغ نهایی|final.*amount|discount/i.test(text))return 'customerPayableAmount';
  if(/محصول|قلم|quantity|stock|تعداد/i.test(text))return 'items';
  return 'general';
}

export default function SaleEntry({products=[],customers=[],setCustomers,onSaved,busy,setBusy,setError,setOk}){
  const [sale,setSale]=useState(blankSale);
  const [newCustomer,setNewCustomer]=useState({name:'',phone:'',address:''});
  const [savedCustomerId,setSavedCustomerId]=useState('');
  const [customerBusy,setCustomerBusy]=useState(false);
  const [manualTotal,setManualTotal]=useState(false);
  const [plateParts,setPlateParts]=useState(blankPlate);
  const [errors,setErrors]=useState({});
  const submitting=useRef(false),creating=useRef(false),lastAdd=useRef(0),nextId=useRef(1);
  const isCredit=sale.paymentType==='CREDIT';
  const subtotal=useMemo(()=>sale.items.reduce((sum,it)=>{
    const p=products.find(x=>x.id===it.productId);
    return sum+Number(p?.price||0)*toNumber(it.quantity);
  },0),[sale.items,products]);
  useEffect(()=>{if(!manualTotal)setSale(v=>({...v,customerPayableAmount:subtotal>0?String(subtotal):''}))},[subtotal,manualTotal]);
  const finalTotal=toNumber(sale.customerPayableAmount);
  const discount=Math.max(0,subtotal-finalTotal);
  function clearError(key){setErrors(v=>{if(!v[key]&&!v.general)return v;const next={...v};delete next[key];delete next.general;return next})}
  function changeItem(id,key,val){setSale(v=>({...v,items:v.items.map(x=>x.id===id?{...x,[key]:val}:x)}));clearError('items')}
  function addItem(){
    // A double-tap must never create two lines. Stable IDs prevent one delete removing two lines.
    const now=Date.now();if(now-lastAdd.current<450)return;lastAdd.current=now;
    const id=`item-${nextId.current++}`;
    setSale(v=>({...v,items:appendSaleItem(v.items,id)}));
  }
  function removeItem(id){setSale(v=>({...v,items:removeSaleItem(v.items,id)}));clearError('items')}
  function setCustomerField(field,value){if(sale.customerId)setSale(v=>({...v,customerId:''}));setSavedCustomerId('');setNewCustomer(v=>({...v,[field]:value}));clearError(field==='phone'?'customerPhone':'customerName')}
  async function createCustomer(){
    if(creating.current)return;
    const err={};if(!newCustomer.name.trim())err.customerName='نام مشتری نسیه را وارد کنید.';
    if(!phoneValid(newCustomer.phone))err.customerPhone='شماره تماس مشتری باید دقیقاً ۱۱ رقم باشد.';
    if(Object.keys(err).length){setErrors(v=>({...v,...err}));return}
    if(savedCustomerId){setSale(v=>({...v,customerId:savedCustomerId}));return;}
    creating.current=true;setCustomerBusy(true);setError?.(null);setErrors({});
    try{
      const r=await api.post('/customers',{...newCustomer,name:newCustomer.name.trim(),phone:cleanPhone(newCustomer.phone)});
      setCustomers?.(v=>v.some(x=>x.id===r.data.id)?v:[...v,r.data]);
      setSale(v=>({...v,customerId:r.data.id}));setSavedCustomerId(r.data.id);
      // Do not erase name/phone: the user needs to see what was saved and selected.
      setOk?.('مشتری نسیه ثبت و برای فروش انتخاب شد.');
    }catch(e){const msg=e?.response?.data?.message||e.message||'ثبت مشتری انجام نشد';setErrors(v=>({...v,[/تماس|phone/i.test(msg)?'customerPhone':'customerName']:msg}))}
    finally{creating.current=false;setCustomerBusy(false)}
  }
  function validate(){
    const errs={};
    if(isCredit&&!sale.customerId)errs.customerId='مشتری نسیه را انتخاب کنید یا مشتری جدید ثبت کنید.';
    if(!sale.items.length||sale.items.some(x=>!x.productId||!Number.isFinite(toNumber(x.quantity))||toNumber(x.quantity)<=0))errs.items='برای هر قلم، محصول و تعداد بیشتر از صفر را وارد کنید.';
    if(new Set(sale.items.map(x=>x.productId).filter(Boolean)).size!==sale.items.filter(x=>x.productId).length)errs.items='هر محصول را فقط یک‌بار انتخاب کنید؛ تعداد آن را در همان ردیف تغییر دهید.';
    if(sale.customerPayableAmount===''||finalTotal<0||finalTotal>subtotal)errs.customerPayableAmount='مبلغ نهایی فروش باید بین صفر و مبلغ محاسبه‌شده باشد.';
    if(isCredit&&(toNumber(sale.paymentAmount)<0||toNumber(sale.paymentAmount)>finalTotal))errs.paymentAmount='پیش‌پرداخت نمی‌تواند از مبلغ نهایی فروش بیشتر باشد.';
    if(sale.driverPhone&&!phoneValid(sale.driverPhone))errs.driverPhone='شماره تماس راننده باید دقیقاً ۱۱ رقم باشد.';
    if(plateToString(plateParts)&&!isCompletePlate(plateParts))errs.plate='پلاک را کامل وارد کنید: ۲ رقم، حرف، ۳ رقم و کد شهر ۲ رقمی.';
    return errs;
  }
  async function submit(e){
    e.preventDefault();if(submitting.current||busy)return;
    setError?.(null);setOk?.('');const errs=validate();setErrors(errs);
    if(Object.keys(errs).length)return;
    submitting.current=true;setBusy?.(true);
    try{
      const driverPhone=cleanPhone(sale.driverPhone);
      const payload={paymentType:sale.paymentType,customerId:isCredit?sale.customerId:undefined,
        paymentAmount:isCredit?toNumber(sale.paymentAmount):undefined,
        paymentMethod:isCredit&&toNumber(sale.paymentAmount)>0?sale.paymentMethod:undefined,
        customerPayableAmount:finalTotal,driverName:sale.driverName.trim()||undefined,
        driverPhone:driverPhone||undefined,driverVehicle:plateToString(plateParts)||undefined,
        note:sale.note.trim()||undefined,items:sale.items.map(x=>({productId:x.productId,quantity:toNumber(x.quantity)}))};
      await api.post('/sales',payload);
      setSale(blankSale());setNewCustomer({name:'',phone:'',address:''});setSavedCustomerId('');
      setPlateParts(blankPlate());setManualTotal(false);nextId.current=1;lastAdd.current=0;
      setOk?.('فروش ثبت شد؛ تاریخ و ساعت توسط سیستم ذخیره شد.');
      try{await onSaved?.()}catch(_){setOk?.('فروش ثبت شد اما فهرست تازه‌سازی نشد؛ صفحه را دوباره باز کنید.')}
    }catch(e){const msg=e?.response?.data?.message||e.message||'ثبت فروش انجام نشد';setErrors(v=>({...v,[detectServerField(msg)]:msg}))}
    finally{submitting.current=false;setBusy?.(false)}
  }
  return <form className="panel operator-form" onSubmit={submit} noValidate>
    <h3>ثبت فروش</h3>
    <div className="form-grid"><label>نوع پرداخت<select value={sale.paymentType} onChange={e=>{setSale(v=>({...v,paymentType:e.target.value,customerId:'',paymentAmount:''}));clearError('customerId')}}><option value="CASH">نقدی</option><option value="CARD">کارت / انتقال بانکی</option><option value="CREDIT">نسیه</option></select></label><div className="auto-time-note">تاریخ و ساعت فروش به‌صورت خودکار ثبت می‌شود.</div></div>
    {isCredit&&<div className="credit-box"><label>مشتری نسیه<select value={sale.customerId} className={errors.customerId?'field-invalid':''} onChange={e=>{setSale(v=>({...v,customerId:e.target.value}));clearError('customerId')}}><option value="">انتخاب مشتری</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?` — ${x.phone}`:''}</option>)}</select>{showError(errors,'customerId')}</label>
      <div className="new-customer-box"><b>مشتری نسیه جدید</b><label>نام مشتری<input value={newCustomer.name} className={errors.customerName?'field-invalid':''} placeholder="نام مشتری" onChange={e=>setCustomerField('name',e.target.value)}/>{showError(errors,'customerName')}</label><label>شماره تماس ۱۱ رقمی<input inputMode="numeric" dir="ltr" maxLength={11} className={errors.customerPhone?'field-invalid':''} placeholder="۰۹۱۲۳۴۵۶۷۸۹" value={newCustomer.phone} onChange={e=>setCustomerField('phone',cleanPhone(e.target.value))}/>{showError(errors,'customerPhone')}</label><button disabled={customerBusy||!!(savedCustomerId&&savedCustomerId===sale.customerId)} type="button" className="ghost" onClick={createCustomer}>{customerBusy?'در حال ثبت…':savedCustomerId===sale.customerId&&savedCustomerId?'مشتری ثبت شد':'ثبت مشتری'}</button>{savedCustomerId&&savedCustomerId===sale.customerId&&<div className="new-customer-confirm">شماره {newCustomer.phone} برای «{newCustomer.name}» ثبت و این مشتری انتخاب شده است.</div>}</div>
      <div className="form-grid"><label>پیش‌پرداخت (اختیاری، تومان)<NumericInput value={sale.paymentAmount} inputMode="numeric" className={errors.paymentAmount?'field-invalid':''} onChange={e=>{setSale(v=>({...v,paymentAmount:e.target.value}));clearError('paymentAmount')}}/>{showError(errors,'paymentAmount')}</label>{toNumber(sale.paymentAmount)>0&&<label>روش پیش‌پرداخت<select value={sale.paymentMethod} onChange={e=>setSale(v=>({...v,paymentMethod:e.target.value}))}><option value="CASH">نقدی</option><option value="CARD">کارت</option><option value="BANK_TRANSFER">انتقال بانکی</option><option value="CHECK">چک</option><option value="OTHER">سایر</option></select></label>}<div className="debt-preview">مانده نسیه پس از ثبت: <b>{formatToman(Math.max(0,finalTotal-toNumber(sale.paymentAmount)))}</b></div></div>
    </div>}
    <h4>اقلام فروش</h4>
    {sale.items.map((it,i)=><div className="sale-line" key={it.id}><select value={it.productId} aria-label={`محصول قلم ${i+1}`} className={errors.items?'field-invalid':''} onChange={e=>changeItem(it.id,'productId',e.target.value)}><option value="">انتخاب محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {formatToman(x.price)}</option>)}</select><NumericInput aria-label={`تعداد قلم ${i+1}`} inputMode="numeric" placeholder="تعداد" value={it.quantity} className={errors.items?'field-invalid':''} onChange={e=>changeItem(it.id,'quantity',e.target.value)}/>{sale.items.length>1&&<button type="button" className="small danger" onClick={()=>removeItem(it.id)}>حذف همین قلم</button>}</div>)}
    {showError(errors,'items')}
    <button type="button" className="ghost" onClick={addItem}>افزودن یک قلم دیگر</button>
    <div className="sale-total"><div>مبلغ محاسبه‌شده: <b>{formatToman(subtotal)}</b></div><label>مبلغ نهایی فروش به مشتری (تومان)<NumericInput inputMode="numeric" value={sale.customerPayableAmount} className={errors.customerPayableAmount?'field-invalid':''} onChange={e=>{setManualTotal(true);setSale(v=>({...v,customerPayableAmount:e.target.value}));clearError('customerPayableAmount')}}/>{showError(errors,'customerPayableAmount')}</label><div>تخفیف محاسبه‌شده: <b>{formatToman(discount)}</b></div></div>
    <div className="driver-box"><h4>اطلاعات راننده (اختیاری)</h4><div className="form-grid"><label>نام راننده<input value={sale.driverName} onChange={e=>setSale(v=>({...v,driverName:e.target.value}))}/></label><label>شماره تماس راننده<input inputMode="numeric" maxLength={11} dir="ltr" className={errors.driverPhone?'field-invalid':''} placeholder="شماره تماس ۱۱ رقمی" value={sale.driverPhone} onChange={e=>{setSale(v=>({...v,driverPhone:cleanPhone(e.target.value)}));clearError('driverPhone')}}/>{showError(errors,'driverPhone')}</label><div className="plate-field-label"><span>پلاک خودرو (اختیاری)</span><IranPlateInput value={plateParts} onChange={v=>{setPlateParts(v);clearError('plate')}}/>{showError(errors,'plate')}</div></div></div>
    <label>توضیحات<textarea value={sale.note} onChange={e=>setSale(v=>({...v,note:e.target.value}))}/></label>
    {showError(errors,'general')}
    <button disabled={busy||customerBusy}>{busy?'در حال ثبت فروش…':'ثبت فروش'}</button>
  </form>;
}
