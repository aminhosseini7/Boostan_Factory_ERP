import {useRef} from 'react';
import {normalizeDigits} from '../utils/fa';

/** Controlled number field: state stays ungrouped, only the visible text has grouping. */
export function groupNumber(value){
  const plain=normalizeDigits(value??'').replace(/[^\d.\-]/g,'');
  if(!plain)return '';
  const sign=plain.startsWith('-')?'-':'';
  const unsigned=plain.replace(/-/g,'');
  const [integer,...rest]=unsigned.split('.');
  return sign+integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(rest.length?'.'+rest.join(''):'');
}
export default function NumericInput({value='',onChange,inputMode='numeric',...props}){
  const inputRef=useRef(null);
  function handleChange(e){
    const original=e.target.value;
    const cursor=e.target.selectionStart??original.length;
    const before=normalizeDigits(original.slice(0,cursor)).replace(/[^\d.]/g,'').length;
    const raw=normalizeDigits(original).replace(/[^\d.\-]/g,'');
    e.target.value=raw;
    onChange?.(e);
    requestAnimationFrame(()=>{
      const el=inputRef.current;
      if(!el||document.activeElement!==el)return;
      const shown=el.value;let pos=0,count=0;
      while(pos<shown.length&&count<before){if(/[\d.]/.test(shown[pos]))count++;pos++}
      // Keep the caret immediately after a just-typed digit, never inside its group separator.
      if(shown[pos]===',')pos++;
      try{el.setSelectionRange(pos,pos)}catch{/* some mobile browsers */}
    });
  }
  return <input {...props} ref={inputRef} type="text" data-grouped-number="true" inputMode={inputMode} value={groupNumber(value)} onChange={handleChange}/>;
}
