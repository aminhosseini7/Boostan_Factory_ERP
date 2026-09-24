import NumericInput from '../components/NumericInput';
import ProductAnalytics from '../components/ProductAnalytics';
import {useEffect,useState} from 'react';
import api from '../services/api';
import {useAuth} from '../context/AuthContext';
import {Page,ErrorBox,Empty} from '../components/Ui';
import {formatToman,formatNumber} from '../utils/fa';

const blank={
  code:'',
  name:'',
  unit:'عدد',
  price:'',
  weightKg:'',
  minimumStock:'',
  openingStock:''
};

export default function Products(){

  const {isManager}=useAuth();

  const [items,setItems]=useState([]);
  const [form,setForm]=useState(blank);
  const [editId,setEditId]=useState(null);
  const [error,setError]=useState(null);


  async function load(){
    try{
      const r=await api.get('/products');
      setItems(r.data);
    }catch(e){
      setError(e);
    }
  }


  useEffect(()=>{
    load();
  },[]);



  async function save(e){

    e.preventDefault();
    setError(null);

    try{

      if(editId){
        await api.put(
          `/products/${editId}`,
          {
            ...form,
            openingStock:undefined
          }
        );
      }
      else{
        await api.post('/products',form);
      }


      setForm(blank);
      setEditId(null);
      await load();

    }catch(e){
      setError(e);
    }
  }



  async function changeActive(x){

    if(!confirm(
      x.isActive
      ? 'محصول غیرفعال شود؟'
      : 'محصول دوباره فعال شود؟'
    )) return;


    try{

      setError(null);

      await api.patch(
        `/products/${x.id}/active`,
        {
          isActive:!x.isActive
        }
      );

      await load();

    }catch(e){
      setError(e);
    }
  }



  function edit(x){

    setEditId(x.id);

    setForm({
      code:x.code||'',
      name:x.name,
      unit:x.unit,
      price:String(x.price??''),
      weightKg:String(x.weightKg??''),
      minimumStock:String(x.minimumStock??''),
      openingStock:''
    });
  }



  return (

<Page title="محصولات">

<ErrorBox error={error}/>


{isManager &&

<form 
className="panel form-grid"
onSubmit={save}
>

<label>
کد
<input
value={form.code}
onChange={e=>setForm({
  ...form,
  code:e.target.value
})}
/>
</label>


<label>
نام
<input
required
value={form.name}
onChange={e=>setForm({
  ...form,
  name:e.target.value
})}
/>
</label>


<label>
واحد
<input
required
value={form.unit}
onChange={e=>setForm({
  ...form,
  unit:e.target.value
})}
/>
</label>


<label>
قیمت فروش (تومان)

<NumericInput
type="text"
inputMode="numeric"
value={form.price}
onChange={e=>setForm({
  ...form,
  price:e.target.value
})}
/>

</label>


<label>
وزن هر سبد (کیلوگرم)

<NumericInput
type="text"
inputMode="decimal"
value={form.weightKg}
onChange={e=>setForm({
  ...form,
  weightKg:e.target.value
})}
/>

</label>


<label>
حداقل موجودی

<NumericInput
type="text"
inputMode="numeric"
value={form.minimumStock}
onChange={e=>setForm({
  ...form,
  minimumStock:e.target.value
})}
/>

</label>


{!editId &&

<label>
موجودی اولیه

<NumericInput
type="text"
inputMode="numeric"
value={form.openingStock}
onChange={e=>setForm({
  ...form,
  openingStock:e.target.value
})}
/>

</label>

}



<button>
{
editId
?'ذخیره تغییرات'
:'افزودن محصول'
}
</button>


{editId &&

<button
type="button"
className="ghost"
onClick={()=>{
 setEditId(null);
 setForm(blank);
}}
>
انصراف
</button>

}


</form>

}



<div className="panel">

{
items.length===0

?

<Empty/>

:

<div className="table-scroll">

<table>

<thead>

<tr>

<th>کد</th>
<th>نام</th>
<th>واحد</th>
<th>وزن</th>
<th>قیمت</th>
<th>حداقل موجودی</th>

{
isManager &&
<th>عملیات</th>
}

</tr>

</thead>



<tbody>


{
items.map(x=>(

<tr
key={x.id}
className={!x.isActive?'muted':''}
>


<td>
{x.code||'-'}
</td>


<td>
{x.name}
</td>


<td>
{x.unit}
</td>


<td>
{formatNumber(x.weightKg||0)}
 کیلوگرم
</td>


<td>
{formatToman(x.price)}
</td>


<td>
{x.minimumStock}
</td>



{
isManager &&

<td>

<button
className="small"
onClick={()=>edit(x)}
>
ویرایش
</button>


<button

className={
x.isActive
?'small danger'
:'small'
}

onClick={()=>changeActive(x)}

>

{
x.isActive
?'غیرفعال'
:'فعال‌سازی'
}

</button>


</td>

}


</tr>

))

}


</tbody>


</table>


</div>

}

</div>



{
isManager &&
<ProductAnalytics products={items}/>
}


</Page>

);

}