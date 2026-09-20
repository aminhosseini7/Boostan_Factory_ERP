import NumericInput from '../components/NumericInput';
import {useEffect,useState} from 'react';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import {formatJalaliDateTime} from '../utils/jalali';
import {formatToman,formatNumber,toNumber} from '../utils/fa';
const blank={purchaseType:'RAW_MATERIAL',supplierName:'',productId:'',materialId:'',quantity:'',weightKg:'',unitPrice:'',note:''};
const types=[['RAW_MATERIAL','مواد اولیه مستقیم'],['USED_SCRAP','سبد دست دوم / ضایعات قابل آسیاب'],['OTHER','سایر ضایعات'],['FINISHED_PRODUCT','سبد / محصول آماده فروش']];
const labels=Object.fromEntries(types);
export default function Purchases(){
 const[rows,setRows]=useState([]),[products,setProducts]=useState([]),[form,setForm]=useState(blank),[error,setError]=useState(null),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{const[a,p]=await Promise.all([api.get('/purchases'),api.get('/products')]);setRows(a.data);setProducts(p.data.filter(x=>x.isActive))}catch(e){setError(e)}}useEffect(()=>{load()},[]);
 const weighted=form.purchaseType!=='FINISHED_PRODUCT';
 async function submit(e){e.preventDefault();setError(null);setOk('');setBusy(true);try{await api.post('/purchases',{...form,materialId:undefined,quantity:toNumber(form.quantity),weightKg:toNumber(form.weightKg),unitPrice:toNumber(form.unitPrice)});setForm(blank);setOk('خرید ثبت شد و موجودی مربوطه به‌روزرسانی شد.');await load()}catch(e){setError(e)}finally{setBusy(false)}}
 return <Page title="خریدها"><ErrorBox error={error}/>{ok&&<div className="success">{ok}</div>}<form className="panel form-grid" onSubmit={submit}>
 <label>نوع خرید<select value={form.purchaseType} onChange={e=>setForm({...blank,purchaseType:e.target.value})}>{types.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>فروشنده / تأمین‌کننده<input value={form.supplierName} onChange={e=>setForm({...form,supplierName:e.target.value})}/></label>
 {form.purchaseType==='FINISHED_PRODUCT'?<><label>محصول<select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}><option value="">انتخاب محصول</option>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>تعداد (عدد)<NumericInput required type="text" inputMode="numeric" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label></>:<><label>وزن کل (کیلوگرم)<NumericInput required type="text" inputMode="decimal" value={form.weightKg} onChange={e=>setForm({...form,weightKg:e.target.value})}/></label></>}
 <label>{weighted?'قیمت هر کیلوگرم':'قیمت هر عدد'} (تومان)<NumericInput required type="text" inputMode="numeric" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})}/></label>
 <label className="wide">توضیحات<textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
 <div className="wide hint">مقصد به‌صورت خودکار تعیین می‌شود: مواد اولیه مستقیم ← مواد آماده؛ سبد دست دوم و سایر ضایعات ← ضایعات قابل آسیاب؛ سبد آماده ← انبار همان محصول. همه وزن‌ها کیلوگرم و قیمت‌ها تومان‌اند.</div>
 <button disabled={busy}>{busy?'در حال ثبت…':'ثبت خرید'}</button></form>
 <div className="panel"><h3>سوابق خرید</h3>{rows.length===0?<Empty/>:<div className="report-table"><table><thead><tr><th>نوع</th><th>تأمین‌کننده</th><th>وزن</th><th>مقدار</th><th>قیمت واحد</th><th>جمع</th><th>تاریخ</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{labels[x.purchaseType]||'سایر'}</td><td>{x.supplierName||'-'}</td><td>{formatNumber(x.weightKg)} کیلوگرم</td><td>{formatNumber(x.quantity)} {x.unit}</td><td>{formatToman(x.unitPrice)}</td><td>{formatToman(x.totalAmount)}</td><td>{formatJalaliDateTime(x.purchasedAt)}</td></tr>)}</tbody></table></div>}</div></Page>
}
