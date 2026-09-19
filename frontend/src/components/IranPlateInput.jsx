import {useRef} from 'react';
import {normalizeDigits} from '../utils/fa';

const fields=['first','letter','middle','city'];
const widths=[2,1,3,2];
const empty={first:'',letter:'',middle:'',city:''};
// Restrict letters to those used on ordinary Iranian private/passenger plates.
const allowedLetters='ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
function normalizeText(value){return normalizeDigits(value??'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,'').trim()}
export function normalizePlateSegment(index,input){
  const text=normalizeText(input);
  if(index===1)return [...text].filter(char=>allowedLetters.includes(char)).slice(-1).join('');
  return text.replace(/[^0-9]/g,'').slice(0,widths[index]);
}
export function isCompletePlate(plate){return fields.every((field,index)=>normalizePlateSegment(index,plate?.[field]||'').length===widths[index]);}
export function plateToString(plate){
  if(fields.every(field=>!plate?.[field]))return '';
  return `${normalizePlateSegment(0,plate?.first)} ${normalizePlateSegment(1,plate?.letter)} ${normalizePlateSegment(2,plate?.middle)} - ${normalizePlateSegment(3,plate?.city)}`.trim();
}

export default function IranPlateInput({value=empty,onChange}){
  const refs=useRef([]);
  // IME/composition events can arrive before React has painted the preceding update.
  // Merge each field into the latest draft, NEVER a stale captured `value` object.
  const latest=useRef(value);
  const composing=useRef(false);
  const scheduledFocus=useRef(null);
  const lastProp=useRef(value);
  if(value!==lastProp.current){latest.current=value;lastProp.current=value;}

  function focusNext(index){
    if(index>=3)return;
    // Queue focus after the new controlled value is committed (particularly on mobile).
    if(scheduledFocus.current!==null)cancelAnimationFrame(scheduledFocus.current);
    scheduledFocus.current=requestAnimationFrame(()=>{
      refs.current[index+1]?.focus();
      scheduledFocus.current=null;
    });
  }
  function update(index,raw,moveFocus=true){
    const field=fields[index];
    const normalized=normalizePlateSegment(index,raw);
    const prev=latest.current[field]||'';
    if(prev!==normalized){
      const next={...latest.current,[field]:normalized};
      latest.current=next;
      onChange?.(next);
    }
    if(moveFocus&&index<3&&normalized.length===widths[index]&&prev!==normalized)focusNext(index);
  }
  function onInput(index,event){
    if(composing.current||event.nativeEvent?.isComposing)return;
    update(index,event.currentTarget.value);
  }
  function onChangeField(index,event){
    if(composing.current||event.nativeEvent?.isComposing)return;
    update(index,event.currentTarget.value);
  }
  function onCompositionEnd(index,event){
    composing.current=false;
    update(index,event.currentTarget.value);
  }
  function onKeyDown(index,event){
    if(event.key==='Backspace'&&!latest.current[fields[index]]&&index>0){
      refs.current[index-1]?.focus();
    }
  }
  function field(index,label,placeholder,extra=''){
    return <input key={fields[index]} ref={element=>{refs.current[index]=element}} aria-label={label}
      placeholder={placeholder} className={extra} dir={index===1?'rtl':'ltr'} type="text"
      inputMode={index===1?'text':'numeric'} maxLength={index===1?undefined:widths[index]}
      value={value?.[fields[index]]||''} autoComplete="off" autoCorrect="off" spellCheck={false}
      onInput={event=>onInput(index,event)} onChange={event=>onChangeField(index,event)}
      onCompositionStart={()=>{composing.current=true}}
      onCompositionEnd={event=>onCompositionEnd(index,event)}
      onKeyDown={event=>onKeyDown(index,event)}/>;
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
