import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {normalizeDigits} from '../utils/fa';
import {jalaliToGregorianDate,todayJalali,toGregorian} from '../utils/jalali';

const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const weekdays=['ش','ی','د','س','چ','پ','ج'];
const two=n=>String(n).padStart(2,'0');
export function normalizeJalaliInput(value){
  const digits=normalizeDigits(value).replace(/\D/g,'').slice(0,8);
  return [digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean).join('/');
}
export function validateJalaliRange(from,to){
  const start=from?jalaliToGregorianDate(from):null;
  const end=to?jalaliToGregorianDate(to):null;
  if(start&&end&&start>end)throw new Error('تاریخ شروع نباید بعد از تاریخ پایان باشد.');
  return {from:start||undefined,to:end||undefined};
}
export function daysInJalaliMonth(year,month){
  if(month>=1&&month<=6)return 31;
  if(month>=7&&month<=11)return 30;
  if(month!==12)return 0;
  try{jalaliToGregorianDate(`${year}/12/30`);return 30;}catch{return 29;}
}
export function firstWeekdayOfJalaliMonth(year,month){
  const g=toGregorian(year,month,1);
  // JS Sunday=0; in Iran the first column is Saturday.
  return (new Date(Date.UTC(g.gy,g.gm-1,g.gd)).getUTCDay()+1)%7;
}
function readParts(value){
  const match=normalizeDigits(value||'').match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  return match?{year:match[1],month:match[2],day:match[3]}:{year:'',month:'',day:''};
}

/** Three explicit Jalali selectors plus an optional visual Persian calendar. */
export default function JalaliDateInput({label,value='',onChange,id}){
  const fallbackId=useId();const inputId=id||fallbackId;
  const [parts,setParts]=useState(()=>readParts(value));
  const lastLocalEmission=useRef(null);
  const [open,setOpen]=useState(false);
  const [error,setError]=useState('');
  const current=useMemo(()=>readParts(todayJalali()),[]);
  const [visible,setVisible]=useState(()=>({year:Number(readParts(value).year||current.year),month:Number(readParts(value).month||current.month)}));
  useEffect(()=>{
    if(value===lastLocalEmission.current){lastLocalEmission.current=null;return;}
    const fromParent=readParts(value);
    setParts(fromParent);
    if(value)setVisible({year:Number(fromParent.year),month:Number(fromParent.month)});
  },[value]);
  function emit(next){lastLocalEmission.current=next;onChange(next);}
  const years=useMemo(()=>{
    const from=Math.min(1380,Number(parts.year)||Infinity,Number(visible.year)||Infinity);
    const to=Math.max(Number(current.year)+10,Number(parts.year)||0,Number(visible.year)||0);
    return Array.from({length:to-from+1},(_,index)=>from+index);
  },[current.year,parts.year,visible.year]);
  const maxDay=parts.year&&parts.month?daysInJalaliMonth(Number(parts.year),Number(parts.month)):31;
  const selectedDay=Number(parts.day)||0;
  function changeParts(field,nextValue){
    const next={...parts,[field]:normalizeDigits(nextValue)};
    if(next.day&&next.year&&next.month&&Number(next.day)>daysInJalaliMonth(Number(next.year),Number(next.month)))next.day='';
    setParts(next);setError('');
    if(next.year&&next.month)setVisible({year:Number(next.year),month:Number(next.month)});
    if(next.year&&next.month&&next.day){
      const selected=`${next.year}/${two(next.month)}/${two(next.day)}`;
      try{jalaliToGregorianDate(selected);emit(selected);}catch(e){setError(e.message);emit('');}
    }else emit('');
  }
  function chooseDay(year,month,day){
    const selected=`${year}/${two(month)}/${two(day)}`;
    try{
      jalaliToGregorianDate(selected);
      setParts({year:String(year),month:two(month),day:two(day)});
      setVisible({year,month});emit(selected);setError('');setOpen(false);
    }catch(e){setError(e.message);}
  }
  function navigate(offset){
    setVisible(previous=>{
      const monthIndex=(previous.year*12+previous.month-1)+offset;
      return {year:Math.floor(monthIndex/12),month:monthIndex%12+1};
    });
  }
  const offset=firstWeekdayOfJalaliMonth(visible.year,visible.month);
  const calendarDays=daysInJalaliMonth(visible.year,visible.month);
  return <div className="jalali-date-field" id={inputId}>
    <span className="jalali-date-label">{label} (شمسی)</span>
    <div className="jalali-date-controls" dir="rtl">
      <select aria-label={`${label}: سال`} value={parts.year} onChange={event=>changeParts('year',event.target.value)}>
        <option value="">سال</option>{years.map(y=><option key={y} value={y}>{y.toLocaleString('fa-IR',{useGrouping:false})}</option>)}
      </select><span aria-hidden="true">/</span>
      <select aria-label={`${label}: ماه`} value={parts.month} onChange={event=>changeParts('month',event.target.value)}>
        <option value="">ماه</option>{months.map((name,index)=><option key={name} value={two(index+1)}>{name}</option>)}
      </select><span aria-hidden="true">/</span>
      <select aria-label={`${label}: روز`} value={parts.day} onChange={event=>changeParts('day',event.target.value)}>
        <option value="">روز</option>{Array.from({length:maxDay},(_,index)=>index+1).map(day=><option key={day} value={two(day)}>{day.toLocaleString('fa-IR',{useGrouping:false})}</option>)}
      </select>
      <button type="button" className="jalali-calendar-trigger ghost" aria-label={`باز کردن تقویم ${label}`} aria-expanded={open} onClick={()=>{if(!open){setVisible({year:Number(parts.year||current.year),month:Number(parts.month||current.month)});}setOpen(!open)}}>🗓</button>
    </div>
    {value&&<small className="date-help" dir="rtl">تاریخ انتخابی: {normalizeDigits(value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}</small>}
    {error&&<small className="field-error" role="alert">{error}</small>}
    {open&&<div className="jalali-calendar" role="group" aria-label={`تقویم شمسی ${label}`}>
      <div className="jalali-calendar-header"><button type="button" className="ghost" onClick={()=>navigate(-1)} aria-label="ماه قبل">‹</button><b>{months[visible.month-1]} {visible.year.toLocaleString('fa-IR',{useGrouping:false})}</b><button type="button" className="ghost" onClick={()=>navigate(1)} aria-label="ماه بعد">›</button></div>
      <div className="jalali-calendar-days">{weekdays.map((day,index)=><strong key={index}>{day}</strong>)}
        {Array.from({length:offset},(_,index)=><span key={`empty-${index}`}/>)}
        {Array.from({length:calendarDays},(_,index)=>index+1).map(day=><button type="button" key={day}
          className={Number(parts.year)===visible.year&&Number(parts.month)===visible.month&&selectedDay===day?'selected-date':''}
          aria-label={`${day} ${months[visible.month-1]} ${visible.year}`} onClick={()=>chooseDay(visible.year,visible.month,day)}>{day.toLocaleString('fa-IR',{useGrouping:false})}</button>)}
      </div><div className="jalali-calendar-footer"><button type="button" className="ghost" onClick={()=>chooseDay(Number(current.year),Number(current.month),Number(current.day))}>امروز</button><button type="button" className="ghost" onClick={()=>{setParts({year:'',month:'',day:''});emit('');setOpen(false);}}>پاک کردن تاریخ</button><button type="button" className="ghost" onClick={()=>setOpen(false)}>بستن</button></div>
    </div>}
  </div>;
}
