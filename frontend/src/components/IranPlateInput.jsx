import {useEffect,useRef,useState} from 'react';
import {normalizeDigits} from '../utils/fa';

const fields=['first','letter','middle','city'];
const widths=[2,1,3,2];
const empty={first:'',letter:'',middle:'',city:''};
const persianPlateLetters='آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
const latinToPersian=s=>normalizeDigits(s).replace(/[ي]/g,'ی').replace(/[ك]/g,'ک');
export function normalizePlateSegment(index,input){
  const text=latinToPersian(input);
  if(index===1)return [...text].filter(x=>persianPlateLetters.includes(x)).slice(-1).join('');
  return text.replace(/\D/g,'').slice(0,widths[index]);
}
export function isCompletePlate(p){return fields.every((key,i)=>normalizePlateSegment(i,p?.[key]||'').length===widths[i]);}
export function plateToString(p){return fields.every(k=>!p?.[k])?'':`${normalizePlateSegment(0,p.first)} ${normalizePlateSegment(1,p.letter)} ${normalizePlateSegment(2,p.middle)} - ${normalizePlateSegment(3,p.city)}`.trim();}

export default function IranPlateInput({value=empty,onChange}){
  const refs=useRef([]);const [pending,setPending]=useState(null);
  useEffect(()=>{if(pending!==null){refs.current[pending]?.focus();setPending(null)}},[pending,value]);
  function update(i,input){
    const next=normalizePlateSegment(i,input);
    const old=value[fields[i]]||'';
    onChange({...value,[fields[i]]:next});
    if(i<3&&next.length===widths[i]&&old!==next)setPending(i+1);
  }
  function back(e,i){if(e.key==='Backspace'&&!value[fields[i]]&&i>0)refs.current[i-1]?.focus()}
  function field(i,label,placeholder,extra=''){
    return <input key={fields[i]} ref={el=>{refs.current[i]=el}} aria-label={label} placeholder={placeholder}
      className={extra} dir={i===1?'rtl':'ltr'} type="text" inputMode={i===1?'text':'numeric'}
      maxLength={widths[i]} value={value[fields[i]]||''} autoComplete="off"
      onChange={e=>update(i,e.target.value)} onCompositionEnd={e=>update(i,e.currentTarget.value)}
      onKeyDown={e=>back(e,i)}/>;
  }
  return <div className="iran-plate" role="group" aria-label="پلاک خودرو با قالب ایرانی">
    {field(0,'دو رقم اول پلاک','۱۶')}
    {field(1,'حرف پلاک','ل','plate-letter')}
    {field(2,'سه رقم وسط پلاک','۷۸۵','plate-middle')}
    <span className="plate-hyphen" aria-hidden="true">–</span>
    {field(3,'دو رقم کد شهر','۴۹','plate-city')}
    <span className="plate-iran">ایران</span>
  </div>;
}
