import {useState} from 'react';
import {normalizeDigits} from '../utils/fa';
import {jalaliToGregorianDate} from '../utils/jalali';

/** Explicit four-digit year/month/day entry; accepts Persian or Latin digits. */
export function normalizeJalaliInput(value) {
  const digits=normalizeDigits(value).replace(/\D/g,'').slice(0,8);
  return [digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean).join('/');
}
export function validateJalaliRange(from,to){
  const start=from?jalaliToGregorianDate(from):null;
  const end=to?jalaliToGregorianDate(to):null;
  if(start&&end&&start>end)throw new Error('تاریخ شروع نباید بعد از تاریخ پایان باشد.');
  return {from:start||undefined,to:end||undefined};
}
export default function JalaliDateInput({label,value,onChange,id}){
  const [error,setError]=useState('');
  function check(){
    if(!value){setError('');return}
    try{jalaliToGregorianDate(value);setError('')}catch(e){setError(e.message)}
  }
  return <label className="jalali-date-field" htmlFor={id}>
    <span>{label} (شمسی)</span>
    <input id={id} type="text" dir="ltr" inputMode="numeric" autoComplete="off"
      placeholder="۱۴۰۵/۰۶/۲۸" aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}
      value={value} onChange={e=>{onChange(normalizeJalaliInput(e.target.value));setError('')}} onBlur={check}/>
    <small className="date-help">سال / ماه / روز — نمونه: ۱۴۰۵/۰۶/۲۸</small>
    {error&&<small className="field-error" id={`${id}-error`} role="alert">{error}</small>}
  </label>;
}
