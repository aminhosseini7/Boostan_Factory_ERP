import {useEffect,useState} from 'react';
import api from '../services/api';
import {Page,ErrorBox,Empty} from '../components/Ui';
import SaleEntry from '../components/SaleEntry';
import {formatJalaliDateTime} from '../utils/jalali';import {formatToman,paymentLabel,saleStatusLabel} from '../utils/fa';

export default function Sales(){
  const [customers,setCustomers]=useState([]),[products,setProducts]=useState([]),[sales,setSales]=useState([]),[error,setError]=useState(null),[ok,setOk]=useState(''),[busy,setBusy]=useState(false);
  async function load(){try{setError(null);const [c,p,s]=await Promise.all([api.get('/customers'),api.get('/products'),api.get('/sales')]);setCustomers(c.data.filter(x=>x.isActive));setProducts(p.data.filter(x=>x.isActive));setSales(s.data)}catch(e){setError(e)}}
  useEffect(()=>{load()},[]);
  return <Page title="فروش"><ErrorBox error={error}/>{ok&&<div className="success">{ok}</div>}<SaleEntry products={products} customers={customers} setCustomers={setCustomers} onSaved={load} busy={busy} setBusy={setBusy} setError={setError} setOk={setOk}/><div className="panel"><h3>سوابق فروش</h3>{sales.length===0?<Empty/>:<div className="report-table"><table><thead><tr><th>مشتری</th><th>مبلغ خالص</th><th>نوع پرداخت</th><th>ثبت‌کننده</th><th>اپراتور شیفت</th><th>راننده</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>{sales.map(x=><tr key={x.id}><td>{x.customerName||'فروش نقدی'}</td><td>{formatToman(x.netTotal)}</td><td>{paymentLabel[x.paymentType]||'نقدی'}</td><td>{x.enteredByName}</td><td>{x.operatorName}</td><td>{x.driverName||'-'}</td><td>{saleStatusLabel[x.status]||'فعال'}</td><td>{formatJalaliDateTime(x.soldAt)}</td></tr>)}</tbody></table></div>}</div></Page>
}
