import {useRef} from 'react';
import {normalizeDigits} from '../utils/fa';

const fields=['first','letter','middle','city'];
const empty={first:'',letter:'',middle:'',city:''};
export function isCompletePlate(p){return /^\d{2}$/.test(p.first)&&/^[آ-ی]$/.test(p.letter)&&/^\d{3}$/.test(p.middle)&&/^\d{2}$/.test(p.city)}
export function plateToString(p){return fields.every(k=>!p[k])?'':`${p.first} ${p.letter} ${p.middle} - ${p.city}`.trim()}
function cleanLetter(v){return String(v).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک').replace(/[^آ-ی]/g,'').slice(-1)}

/** Four independent fields; finishing any segment focuses the next one. */
export default function IranPlateInput({value=empty,onChange}){
  const refs=useRef([]);
  function update(i,text){
    const field=fields[i];const len=[2,1,3,2][i];
    const clean=i===1?cleanLetter(text):normalizeDigits(text).replace(/\D/g,'').slice(0,len);
    onChange({...value,[field]:clean});
    if(clean.length===len&&i<3)refs.current[i+1]?.focus();
  }
  function back(e,i){if(e.key==='Backspace'&&!value[fields[i]]&&i>0)refs.current[i-1]?.focus()}
  return <div className="iran-plate" role="group" aria-label="پلاک خودرو با قالب ایرانی">
    <input ref={el=>{refs.current[0]=el}} aria-label="دو رقم اول پلاک" placeholder="۱۶" dir="ltr" type="text" inputMode="numeric" maxLength={2} value={value.first} onChange={e=>update(0,e.target.value)} onKeyDown={e=>back(e,0)}/>
    <input ref={el=>{refs.current[1]=el}} aria-label="حرف پلاک" placeholder="ل" className="plate-letter" dir="rtl" type="text" maxLength={1} value={value.letter} onChange={e=>update(1,e.target.value)} onKeyDown={e=>back(e,1)}/>
    <input ref={el=>{refs.current[2]=el}} aria-label="سه رقم وسط پلاک" placeholder="۷۸۵" className="plate-middle" dir="ltr" type="text" inputMode="numeric" maxLength={3} value={value.middle} onChange={e=>update(2,e.target.value)} onKeyDown={e=>back(e,2)}/>
    <span className="plate-hyphen" aria-hidden="true">–</span>
    <input ref={el=>{refs.current[3]=el}} aria-label="دو رقم کد شهر" placeholder="۴۹" className="plate-city" dir="ltr" type="text" inputMode="numeric" maxLength={2} value={value.city} onChange={e=>update(3,e.target.value)} onKeyDown={e=>back(e,3)}/>
    <span className="plate-iran">ایران</span>
  </div>;
}
