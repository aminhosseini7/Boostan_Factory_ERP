import {appendSaleItem,removeSaleItem} from '../utils/saleItems';
import {useEffect,useMemo,useRef,useState} from 'react';
import api from '../services/api';
import {formatToman,normalizeDigits,toNumber} from '../utils/fa';
import NumericInput from './NumericInput';
import IranPlateInput, {plateToString,isCompletePlate} from './IranPlateInput';

const uniqueRowId=()=>globalThis.crypto?.randomUUID?.()||`row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const firstItem=()=>({id:uniqueRowId(),productId:'',quantity:''});
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

export default function SaleEntry({products=[],customers=[],setCustomers,onSaved,busy,setBusy,setError,setOk,allowDuplicateOverride=false}){
  const [sale,setSale]=useState(blankSale);
  const [newCustomer,setNewCustomer]=useState({name:'',phone:'',address:''});
  const [savedCustomerId,setSavedCustomerId]=useState('');
  const [customerBusy,setCustomerBusy]=useState(false);
  const [manualTotal,setManualTotal]=useState(false);
  const [plateParts,setPlateParts]=useState(blankPlate);
  const [errors,setErrors]=useState({});
  const [showDriverInfo,setShowDriverInfo]=useState(false);
  const [includeSettled,setIncludeSettled]=useState(false);
  const submitting=useRef(false),creating=useRef(false),lastAdd=useRef(0);
  const [duplicateCandidate,setDuplicateCandidate]=useState(null);
  const [preview,setPreview]=useState(null);
  const previewBackRef=useRef(null);
  const requestRef=useRef({key:'',id:''});
  const requestId=()=>globalThis.crypto?.randomUUID?.()||'00000000-0000-4000-8000-'+Math.random().toString(16).slice(2).padEnd(12,'0').slice(0,12);
  async function confirmDuplicate(){
    if(!allowDuplicateOverride||!duplicateCandidate||submitting.current||busy||customerBusy)return;
    const reason=prompt('اگر این یک فروش مستقل واقعی است، علت ثبت فروش مشابه را بنویسید (حداقل ۵ حرف):');
    if(!reason||reason.trim().length<5)return;
    submitting.current=true;setBusy?.(true);setErrors({});
    try{
      const payload={...duplicateCandidate,duplicateOverride:true,overrideReason:reason.trim()};
      const key=JSON.stringify(payload);
      if(requestRef.current.key!==key)requestRef.current={key,id:requestId()};
      await api.post('/sales',{...payload,requestId:requestRef.current.id});
      requestRef.current={key:'',id:''};setDuplicateCandidate(null);
      setSale(blankSale());setNewCustomer({name:'',phone:'',address:''});setSavedCustomerId('');setPlateParts(blankPlate());setManualTotal(false);setShowDriverInfo(false);
      setOk?.('فروش مستقل با تأیید مدیر ثبت شد.');
      try{await onSaved?.()}catch(_){setOk?.('فروش ثبت شد اما فهرست تازه‌سازی نشد؛ صفحه را دوباره باز کنید.')}
    }catch(e){setErrors(v=>({...v,general:e.response?.data?.message||e.message||'ثبت فروش انجام نشد'}))}
    finally{submitting.current=false;setBusy?.(false)}
  }

  const isCredit=sale.paymentType==='CREDIT';
  const subtotal=useMemo(()=>sale.items.reduce((sum,it)=>{
    const p=products.find(x=>x.id===it.productId);
    return sum+Number(p?.price||0)*toNumber(it.quantity);
  },0),[sale.items,products]);
  useEffect(()=>{if(!manualTotal)setSale(v=>({...v,customerPayableAmount:subtotal>0?String(subtotal):''}))},[subtotal,manualTotal]);
  const finalTotal=toNumber(sale.customerPayableAmount);
  const discount=Math.max(0,subtotal-finalTotal);
  useEffect(()=>{if(preview)previewBackRef.current?.focus()},[preview]);
  function clearError(key){setErrors(v=>{if(!v[key]&&!v.general)return v;const next={...v};delete next[key];delete next.general;return next})}
  function changeItem(id,key,val){setSale(v=>({...v,items:v.items.map(x=>x.id===id?{...x,[key]:val}:x)}));clearError('items')}
  function addItem(){
    // A double-tap must never create two lines. Stable IDs prevent one delete removing two lines.
    const now=Date.now();if(now-lastAdd.current<700)return;lastAdd.current=now;
    const id=uniqueRowId();
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
    if(sale.items.some(x=>x.productId&&!products.some(p=>p.id===x.productId)))errs.items='محصول انتخاب‌شده در فهرست فعلی موجود نیست؛ محصول را دوباره انتخاب کنید.';
    if(new Set(sale.items.map(x=>x.productId).filter(Boolean)).size!==sale.items.filter(x=>x.productId).length)errs.items='هر محصول را فقط یک‌بار انتخاب کنید؛ تعداد آن را در همان ردیف تغییر دهید.';
    if(sale.customerPayableAmount===''||finalTotal<0||finalTotal>subtotal)errs.customerPayableAmount='مبلغ نهایی فروش باید بین صفر و مبلغ محاسبه‌شده باشد.';
    if(isCredit&&(toNumber(sale.paymentAmount)<0||toNumber(sale.paymentAmount)>finalTotal))errs.paymentAmount='پیش‌پرداخت نمی‌تواند از مبلغ نهایی فروش بیشتر باشد.';
    if(sale.driverPhone&&!phoneValid(sale.driverPhone))errs.driverPhone='شماره تماس راننده باید دقیقاً ۱۱ رقم باشد.';
    if(plateToString(plateParts)&&!isCompletePlate(plateParts))errs.plate='پلاک را کامل وارد کنید: ۲ رقم، حرف، ۳ رقم و کد شهر ۲ رقمی.';
    return errs;
  }
  // Invoice review does not post a sale; only the final approval calls the API.
  function submit(e){
    e.preventDefault();if(preview||submitting.current||busy||customerBusy)return;
    setError?.(null);setOk?.('');const errs=validate();setErrors(errs);
    if(Object.keys(errs).length)return;
    const driverPhone=cleanPhone(sale.driverPhone);
    const payload={paymentType:sale.paymentType,customerId:isCredit?sale.customerId:undefined,
      paymentAmount:isCredit?toNumber(sale.paymentAmount):undefined,
      paymentMethod:isCredit&&toNumber(sale.paymentAmount)>0?sale.paymentMethod:undefined,
      customerPayableAmount:finalTotal,driverName:isCredit?(sale.driverName.trim()||undefined):undefined,
      driverPhone:isCredit?(driverPhone||undefined):undefined,driverVehicle:isCredit?(plateToString(plateParts)||undefined):undefined,
      note:sale.note.trim()||undefined,items:sale.items.map(x=>({productId:x.productId,quantity:toNumber(x.quantity)}))};
    const rows=sale.items.map(it=>{
      const product=products.find(p=>p.id===it.productId);
      const quantity=toNumber(it.quantity),unitPrice=Number(product?.price||0);
      return {id:it.id,code:product?.code||'',name:product?.name||'محصول',quantity,unitPrice,total:quantity*unitPrice};
    });
    setDuplicateCandidate(null);
    setPreview({payload,rows,subtotal,discount,createdAt:new Date().toISOString(),
      customerName:isCredit?(customers.find(c=>c.id===sale.customerId)?.name||newCustomer.name.trim()||'مشتری انتخاب‌شده'):'فروش حضوری',
      driverName:isCredit?sale.driverName.trim():'',driverPhone:isCredit?driverPhone:'',
      driverVehicle:isCredit?plateToString(plateParts):''});
  }
  async function confirmSale(){
    if(!preview||submitting.current||busy||customerBusy)return;
    const approved=preview;
    submitting.current=true;setBusy?.(true);setErrors({});setError?.(null);
    try{
      const payload={...approved.payload};
      const key=JSON.stringify(payload);
      // Reuse this request ID after a network failure to avoid a duplicate sale.
      if(requestRef.current.key!==key)requestRef.current={key,id:requestId()};
      payload.requestId=requestRef.current.id;
      await api.post('/sales',payload);
      requestRef.current={key:'',id:''};
      setPreview(null);
      setSale(blankSale());setNewCustomer({name:'',phone:'',address:''});setSavedCustomerId('');
      setPlateParts(blankPlate());setManualTotal(false);setShowDriverInfo(false);lastAdd.current=0;
      setOk?.('فروش پس از تأیید فاکتور ثبت شد؛ تاریخ و ساعت توسط سیستم ذخیره شد.');
      try{await onSaved?.()}catch(_){setOk?.('فروش ثبت شد اما فهرست تازه‌سازی نشد؛ صفحه را دوباره باز کنید.')}
    }catch(e){
      const msg=e?.response?.data?.message||e.message||'ثبت فروش انجام نشد';
      if(allowDuplicateOverride&&msg.includes('این فروش کمتر از ۱۰ دقیقه پیش ثبت شده است')){
        setDuplicateCandidate(approved.payload);
      }
      setPreview(null);
      setErrors(v=>({...v,[detectServerField(msg)]:msg}));
    }finally{submitting.current=false;setBusy?.(false)}
  }
  return <><form className="panel operator-form" onSubmit={submit} noValidate>
    <div className="form-grid"><label>نوع پرداخت<select value={sale.paymentType} onChange={e=>{const nextPaymentType=e.target.value;setSale(v=>({...v,paymentType:nextPaymentType,customerId:'',paymentAmount:'',driverName:nextPaymentType==='CREDIT'?v.driverName:'',driverPhone:nextPaymentType==='CREDIT'?v.driverPhone:'',}));if(nextPaymentType!=='CREDIT')setPlateParts(blankPlate());setShowDriverInfo(false);clearError('customerId')}}><option value="CASH">نقدی</option><option value="CARD">کارت / انتقال بانکی</option><option value="CREDIT">نسیه</option></select></label></div>
    {isCredit&&<div className="credit-box"><label>مشتری نسیه<select value={sale.customerId} className={errors.customerId?'field-invalid':''} onChange={e=>{setSale(v=>({...v,customerId:e.target.value}));clearError('customerId')}}><option value="">انتخاب مشتری</option>{customers.filter(x=>includeSettled||x.id===sale.customerId||x.hasDebt||Number(x.balance)>0).map(x=><option key={x.id} value={x.id}>{x.name}{x.phone?` — ${x.phone}`:''}</option>)}</select>{showError(errors,'customerId')}</label><label className="show-settled"><input type="checkbox" checked={includeSettled} onChange={e=>setIncludeSettled(e.target.checked)}/> نمایش مشتریان تسویه‌شده برای فروش نسیه جدید</label>
      <div className="new-customer-box"><b>مشتری نسیه جدید</b><label>نام مشتری<input value={newCustomer.name} className={errors.customerName?'field-invalid':''} placeholder="نام مشتری" onChange={e=>setCustomerField('name',e.target.value)}/>{showError(errors,'customerName')}</label><label>شماره تماس ۱۱ رقمی<input inputMode="numeric" dir="ltr" maxLength={11} className={errors.customerPhone?'field-invalid':''} placeholder="۰۹۱۲۳۴۵۶۷۸۹" value={newCustomer.phone} onChange={e=>setCustomerField('phone',cleanPhone(e.target.value))}/>{showError(errors,'customerPhone')}</label><button disabled={customerBusy||!!(savedCustomerId&&savedCustomerId===sale.customerId)} type="button" className="ghost" onClick={createCustomer}>{customerBusy?'در حال ثبت…':savedCustomerId===sale.customerId&&savedCustomerId?'مشتری ثبت شد':'ثبت مشتری'}</button>{savedCustomerId&&savedCustomerId===sale.customerId&&<div className="new-customer-confirm">شماره {newCustomer.phone} برای «{newCustomer.name}» ثبت و این مشتری انتخاب شده است.</div>}</div>
      <div className="form-grid"><label>پیش‌پرداخت (اختیاری، تومان)<NumericInput value={sale.paymentAmount} inputMode="numeric" className={errors.paymentAmount?'field-invalid':''} onChange={e=>{setSale(v=>({...v,paymentAmount:e.target.value}));clearError('paymentAmount')}}/>{showError(errors,'paymentAmount')}</label>{toNumber(sale.paymentAmount)>0&&<label>روش پیش‌پرداخت<select value={sale.paymentMethod} onChange={e=>setSale(v=>({...v,paymentMethod:e.target.value}))}><option value="CASH">نقدی</option><option value="CARD">کارت</option><option value="BANK_TRANSFER">انتقال بانکی</option><option value="CHECK">چک</option><option value="OTHER">سایر</option></select></label>}<div className="debt-preview">مانده نسیه پس از ثبت: <b>{formatToman(Math.max(0,finalTotal-toNumber(sale.paymentAmount)))}</b></div></div>
    </div>}
    {sale.items.map((it,i)=><div className="sale-line" key={it.id}><span className="sale-item-number">قلم {i+1}</span><select value={it.productId} aria-label={`محصول قلم ${i+1}`} className={errors.items?'field-invalid':''} onChange={e=>changeItem(it.id,'productId',e.target.value)}><option value="">انتخاب محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name} — {formatToman(x.price)}</option>)}</select><NumericInput aria-label={`تعداد قلم ${i+1}`} inputMode="numeric" placeholder="تعداد" value={it.quantity} className={errors.items?'field-invalid':''} onChange={e=>changeItem(it.id,'quantity',e.target.value)}/>{sale.items.length>1&&<button type="button" className="small danger" onClick={()=>removeItem(it.id)}>حذف همین قلم</button>}</div>)}
    {showError(errors,'items')}
    <button type="button" className="ghost add-sale-item-btn" onClick={addItem} title="افزودن قلم دیگر" aria-label="افزودن قلم دیگر">＋</button>
    {sale.items.length>1&&<small className="sale-item-count" role="status">تعداد اقلام فروش: {sale.items.length}</small>}
    <div className="sale-total"><div>مبلغ محاسبه‌شده: <b>{formatToman(subtotal)}</b></div><label>مبلغ نهایی فروش به مشتری (تومان)<NumericInput inputMode="numeric" value={sale.customerPayableAmount} className={errors.customerPayableAmount?'field-invalid':''} onChange={e=>{setManualTotal(true);setSale(v=>({...v,customerPayableAmount:e.target.value}));clearError('customerPayableAmount')}}/>{showError(errors,'customerPayableAmount')}</label><div>تخفیف محاسبه‌شده: <b>{formatToman(discount)}</b></div></div>
    {isCredit&&<div className="driver-section"><button type="button" className="ghost driver-toggle" onClick={()=>setShowDriverInfo(v=>!v)} aria-expanded={showDriverInfo}>{showDriverInfo?'−':'＋'} اطلاعات راننده</button>{showDriverInfo&&<div className="driver-box"><div className="form-grid"><label>نام راننده<input value={sale.driverName} onChange={e=>setSale(v=>({...v,driverName:e.target.value}))}/></label><label>شماره تماس راننده<input inputMode="numeric" maxLength={11} dir="ltr" className={errors.driverPhone?'field-invalid':''} placeholder="شماره تماس ۱۱ رقمی" value={sale.driverPhone} onChange={e=>{setSale(v=>({...v,driverPhone:cleanPhone(e.target.value)}));clearError('driverPhone')}}/>{showError(errors,'driverPhone')}</label><div className="plate-field-label"><span>پلاک خودرو (اختیاری)</span><IranPlateInput value={plateParts} onChange={v=>{setPlateParts(v);clearError('plate')}}/>{showError(errors,'plate')}</div></div></div>}</div>}
    <label>توضیحات<textarea value={sale.note} onChange={e=>setSale(v=>({...v,note:e.target.value}))}/></label>
    {showError(errors,'general')}
    {allowDuplicateOverride&&duplicateCandidate&&<div className="warning"><b>فروش مشابه در ده دقیقه اخیر پیدا شد.</b><p>اگر مشتری واقعاً دوباره خرید کرده است، فقط مدیر می‌تواند با ثبت علت، فروش مستقل را ثبت کند.</p><button type="button" onClick={confirmDuplicate} disabled={busy}>ثبت مستقل با تأیید مدیر</button></div>}
    <button type="submit" disabled={busy||customerBusy||!!preview}>بررسی فاکتور</button>
  </form>
    {preview&&<div role="presentation" style={{position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px',boxSizing:'border-box'}}>
      <div role="dialog" aria-modal="true" aria-labelledby="sale-invoice-heading" dir="rtl"
        onKeyDown={e=>{
          if(e.key==='Escape'&&!busy&&!submitting.current){e.stopPropagation();setPreview(null)}
          if(e.key==='Tab'&&!e.shiftKey&&e.target?.dataset?.finalSale==='true'){
            e.preventDefault();previewBackRef.current?.focus();
          }else if(e.key==='Tab'&&e.shiftKey&&e.target===previewBackRef.current){
            e.preventDefault();e.currentTarget.querySelector('[data-final-sale]')?.focus();
          }
        }}
        style={{width:'100%',maxWidth:520,maxHeight:'calc(100vh - 24px)',overflowY:'auto',boxSizing:'border-box',background:'#fff',color:'#222',borderRadius:12,padding:18,boxShadow:'0 14px 45px rgba(0,0,0,.3)',fontSize:13,lineHeight:1.8}}>
        <div style={{textAlign:'center',borderBottom:'1px dashed #bbb',paddingBottom:10,marginBottom:12}}>
          <h2 id="sale-invoice-heading" style={{fontSize:19,margin:'0 0 4px'}}>کارخانه سبدسازی بوستان</h2>
          <div style={{fontWeight:600}}>پیش‌نمایش فاکتور فروش</div>
          <small>هنوز فروشی ثبت نشده است؛ شماره فاکتور پس از ثبت صادر می‌شود.</small>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginBottom:8}}>
          <span>زمان بررسی: {new Date(preview.createdAt).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})}</span>
          <span>نوع پرداخت: {preview.payload.paymentType==='CREDIT'?'نسیه':preview.payload.paymentType==='CARD'?'کارت / انتقال بانکی':'نقدی'}</span>
        </div>
        <div style={{marginBottom:10}}>خریدار: <b>{preview.customerName}</b></div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'right'}}>
            <thead><tr style={{borderBottom:'1px solid #bbb'}}>
              <th style={{padding:'6px 3px'}}>کد / سبد</th><th style={{padding:'6px 3px',whiteSpace:'nowrap'}}>تعداد</th>
              <th style={{padding:'6px 3px',whiteSpace:'nowrap'}}>فی (تومان)</th><th style={{padding:'6px 3px',whiteSpace:'nowrap'}}>مبلغ (تومان)</th>
            </tr></thead>
            <tbody>{preview.rows.map(row=><tr key={row.id} style={{borderBottom:'1px solid #eee'}}>
              <td style={{padding:'7px 3px'}}><b>{row.code||row.name}</b>{row.code&&row.name&&<div style={{fontSize:11,color:'#666'}}>{row.name}</div>}</td>
              <td style={{padding:'7px 3px',whiteSpace:'nowrap'}}>{row.quantity.toLocaleString('fa-IR')}</td>
              <td style={{padding:'7px 3px',whiteSpace:'nowrap'}}>{formatToman(row.unitPrice)}</td>
              <td style={{padding:'7px 3px',whiteSpace:'nowrap'}}>{formatToman(row.total)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{borderTop:'1px dashed #bbb',marginTop:12,paddingTop:9}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:8}}><span>جمع قبل از تخفیف:</span><b>{formatToman(preview.subtotal)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',gap:8}}><span>تخفیف فروش:</span><b>{formatToman(preview.discount)}</b></div>
          <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:16,borderTop:'1px solid #ddd',marginTop:7,paddingTop:7}}><b>مبلغ نهایی:</b><b>{formatToman(preview.payload.customerPayableAmount)}</b></div>
          {preview.payload.paymentType==='CREDIT'&&<>
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}><span>پیش‌پرداخت:</span><b>{formatToman(preview.payload.paymentAmount||0)}</b></div>
            {Number(preview.payload.paymentAmount)>0&&<div>روش پیش‌پرداخت: {({CASH:'نقدی',CARD:'کارت',BANK_TRANSFER:'انتقال بانکی',CHECK:'چک',OTHER:'سایر'})[preview.payload.paymentMethod]||'—'}</div>}
            <div style={{display:'flex',justifyContent:'space-between',gap:8}}><span>مانده نسیه:</span><b>{formatToman(Math.max(0,preview.payload.customerPayableAmount-(preview.payload.paymentAmount||0)))}</b></div>
          </>}
        </div>
        {(preview.driverName||preview.driverPhone||preview.driverVehicle)&&<div style={{marginTop:8,fontSize:12}}>راننده: {[preview.driverName,preview.driverPhone,preview.driverVehicle].filter(Boolean).join(' — ')}</div>}
        {preview.payload.note&&<div style={{marginTop:8,fontSize:12,overflowWrap:'anywhere'}}>توضیحات: {preview.payload.note}</div>}
        <div style={{display:'flex',gap:8,marginTop:16}}>
          <button type="button" className="ghost" ref={previewBackRef} disabled={busy} onClick={()=>setPreview(null)} style={{flex:1}}>بازگشت و اصلاح</button>
          <button type="button" data-final-sale="true" disabled={busy} onClick={confirmSale} style={{flex:1}}>{busy?'در حال ثبت…':'تأیید و ثبت نهایی'}</button>
        </div>
      </div>
    </div>}
  </>;
}
