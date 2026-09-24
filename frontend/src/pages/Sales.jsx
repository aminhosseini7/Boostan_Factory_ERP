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
 const [query,setQuery]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [enteredBy,setEnteredBy]=useState('');
 const [creators,setCreators]=useState([]);
 const [selected,setSelected]=useState(''),[searching,setSearching]=useState(false);

 async function load(options){
  try{
   setError(null);
   const params=options || {since:new Date(Date.now()-50*60*60*1000).toISOString()};
   const [c,p,s]=await Promise.all([
    api.get('/customers'),
    api.get('/products'),
    api.get('/sales',{params})
   ]);
   setCustomers(c.data.filter(x=>x.isActive));
   setProducts(p.data);
   setSales(s.data);
   setCreators(previous=>{
    const byId=new Map(previous.map(person=>[person.id,person]));
    for(const record of s.data){
     if(record.enteredBy)byId.set(record.enteredBy,{id:record.enteredBy,fullName:record.enteredByName||byId.get(record.enteredBy)?.fullName||'ثبت‌کننده بدون نام'});
    }
    return [...byId.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'fa'));
   });
  }catch(e){setError(e)}
 }

 useEffect(()=>{
  load();
  // This manager-only endpoint supplies all registered users, including ones
  // with no sale in the default 50-hour search window.
  api.get('/users').then(response=>{
   setCreators(previous=>{
    const byId=new Map(previous.map(person=>[person.id,person]));
    for(const person of response.data||[]){
     if(person.id)byId.set(person.id,{id:person.id,fullName:person.fullName||byId.get(person.id)?.fullName||'ثبت‌کننده بدون نام'});
    }
    return [...byId.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'fa'));
   });
  }).catch(()=>{}); // Sales still works if the users list is unavailable.
 },[]);

 async function search(e){
  e.preventDefault();
  try{
   setSearching(true);
   const range=validateJalaliRange(from,to);
   await load({q:query||undefined,enteredBy:enteredBy||undefined,...range});
  }catch(e){setError(e)}
  finally{setSearching(false)}
 }

 
 function saleQuantity(x){
 return x.quantity==null?'—':Number(x.quantity).toLocaleString('fa-IR');
}

function saleProductCodes(sale){
  // Product names in the sales API and product codes in /products both
  // refer to the current products catalog. Never guess when a name is ambiguous.
  const names=Array.isArray(sale.productNames)
    ? sale.productNames
    : (sale.productNames ? [sale.productNames] : []);
  if(!names.length)return '—';
  return names.map(name=>{
    const matches=products.filter(product=>product.name===name);
    return matches.length===1 && String(matches[0].code??'').trim()
      ? String(matches[0].code).trim()
      : '—';
  }).join('، ');
}

 return <Page title="فروش">
 <ErrorBox error={error}/>
 {ok&&<div className="success">{ok}</div>}

 <SaleEntry products={products.filter(x=>x.isActive)} customers={customers}
 setCustomers={setCustomers} onSaved={()=>load()} busy={busy}
 setBusy={setBusy} setError={setError} setOk={setOk}
 allowDuplicateOverride/>

 <div className="panel">
 <h3>جستجوی فروش برای اصلاح توسط مدیر</h3>

 <form className="toolbar manager-date-toolbar" onSubmit={search}>
 <label>مشتری / تلفن یا شناسه فاکتور
 <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجو"/>
 </label>

 <label>ثبت‌کننده
 <select value={enteredBy} onChange={e=>setEnteredBy(e.target.value)}>
 <option value="">همه</option>
 {creators.map(person=><option key={person.id} value={person.id}>{person.fullName}</option>)}
 </select>
 </label>

 <JalaliDateInput label="از تاریخ" value={from} onChange={setFrom}/>
 <JalaliDateInput label="تا تاریخ" value={to} onChange={setTo}/>

 <button disabled={searching}>{searching?'در حال جستجو...':'جستجو'}</button>
 <button type="button" className="ghost" onClick={()=>{setFrom('');setTo('');setQuery('');setEnteredBy('');load()}}>پاک کردن</button>
 </form>

 {sales.length===0?<Empty/>:
 <div className="report-table recent-scroll"><table>
 <thead><tr>
 <th>مشتری</th><th>کد سبد</th><th>تعداد</th><th>تخفیف (تومان)</th><th>مبلغ خالص</th><th>پرداخت</th>
 <th>ثبت‌کننده</th><th>اپراتور</th><th>وضعیت</th><th>زمان</th><th>اصلاح</th>
 </tr></thead>
 <tbody>
 {sales.map(x=><tr key={x.id}>
 <td>{x.customerName||'فروش نقدی'}</td>
 <td title={Array.isArray(x.productNames)?x.productNames.join('، '):String(x.productNames||'')}>{saleProductCodes(x)}</td>
 <td>{saleQuantity(x)}</td>
 <td>{Number(x.discountAmount??0).toLocaleString('fa-IR')}</td>
 <td>{formatToman(x.netTotal)}</td>
 <td>{paymentLabel[x.paymentType]||x.paymentType}</td>
 <td>{x.enteredByName||'-'}</td>
 <td>{x.operatorName||'-'}</td>
 <td>{saleStatusLabel[x.status]||'فعال'}</td>
 <td>{formatJalaliDateTime(x.soldAt)}</td>
 <td><button type="button" className="small" onClick={()=>setSelected(x.id)}>اصلاح</button></td>
 </tr>)}
 </tbody></table></div>}
 </div>

 {selected&&<ManagerSaleEditor saleId={selected} products={products}
 onClose={()=>setSelected('')}
 onSaved={async()=>{setSelected('');setOk('اصلاح شد');await load()}}/>}

 </Page>;
}
