import {useEffect,useState} from 'react';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import SaleEntry from '../components/SaleEntry';
import ManagerSaleEditor from '../components/ManagerSaleEditor';
import JalaliDateInput,{validateJalaliRange} from '../components/JalaliDateInput';
import {formatJalaliDateTime} from '../utils/jalali';
import {formatToman,paymentLabel,saleStatusLabel} from '../utils/fa';
export default function Sales(){
 const [customers,setCustomers]=useState([]),[products,setProducts]=useState([]),[sales,setSales]=useState([]);
 const [error,setError]=useState(null),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
 const [query,setQuery]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[selected,setSelected]=useState(''),[searching,setSearching]=useState(false);
 async function load(options){try{
   setError(null);
   const params=options || {since:new Date(Date.now()-50*60*60*1000).toISOString()};
   const [c,p,s]=await Promise.all([api.get('/customers'),api.get('/products'),api.get('/sales',{params})]);
   setCustomers(c.data.filter(x=>x.isActive));setProducts(p.data);setSales(s.data);
 }catch(e){setError(e)}}
 useEffect(()=>{load()},[]);
 async function search(e){e.preventDefault();try{
   setSearching(true);const range=validateJalaliRange(from,to);
   await load({q:query||undefined,...range});
 }catch(e){setError(e)}finally{setSearching(false)}}
 return <Page title="فروش"><ErrorBox error={error}/>{ok&&<div className="success">{ok}</div>}
 <SaleEntry products={products.filter(x=>x.isActive)} customers={customers} setCustomers={setCustomers} onSaved={()=>load()} busy={busy} setBusy={setBusy} setError={setError} setOk={setOk} allowDuplicateOverride/>
 <div className="panel"><h3>جستجوی فروش برای اصلاح توسط مدیر</h3>
 <form className="toolbar manager-date-toolbar" onSubmit={search}>
 <label>مشتری، تلفن یا شناسه فاکتور<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="اختیاری"/></label>
 <JalaliDateInput label="از تاریخ" value={from} onChange={setFrom}/><JalaliDateInput label="تا تاریخ" value={to} onChange={setTo}/>
 <button disabled={searching}>{searching?'در حال جستجو…':'جستجو'}</button><button type="button" className="ghost" onClick={()=>{setFrom('');setTo('');setQuery('');load()}}>۵۰ ساعت گذشته</button></form>
 <p className="hint">حداکثر ۱۵۰ فاکتور در هر جستجو نشان داده می‌شود؛ برای فاکتورهای قدیمی، بازه تاریخی یا نام مشتری را وارد کنید. اصلاح فاکتور دارای مرجوعی/ابطال از این مسیر مجاز نیست.</p>
 {sales.length===0?<Empty/>:<div className="report-table recent-scroll"><table><thead><tr><th>مشتری</th><th>مبلغ خالص</th><th>نوع پرداخت</th><th>ثبت‌کننده</th><th>اپراتور شیفت</th><th>وضعیت</th><th>زمان</th><th>اصلاح</th></tr></thead><tbody>
 {sales.map(x=><tr key={x.id}><td>{x.customerName||'فروش نقدی'}</td><td>{formatToman(x.netTotal)}</td><td>{paymentLabel[x.paymentType]||x.paymentType}</td><td>{x.enteredByName||'-'}</td><td>{x.operatorName||'-'}</td><td>{saleStatusLabel[x.status]||'فعال'}</td><td>{formatJalaliDateTime(x.soldAt)}</td><td><button type="button" className="small" onClick={()=>setSelected(x.id)}>اصلاح</button></td></tr>)}
 </tbody></table></div>}</div>
 {selected&&<ManagerSaleEditor saleId={selected} products={products} onClose={()=>setSelected('')} onSaved={async()=>{setSelected('');setOk('فاکتور اصلاح شد و موجودی و حساب مشتری به‌روزرسانی شدند.');await load()}}/>}
 </Page>;
}
