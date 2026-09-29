import React from 'react';import {createRoot} from 'react-dom/client';import {HashRouter} from 'react-router-dom';import App from './App';import {AuthProvider} from './context/AuthContext';import './styles.css';

document.addEventListener('submit',e=>{const btn=e.submitter;if(!(btn instanceof HTMLButtonElement))return;btn.classList.add('submitting-ui');btn.dataset.originalText=btn.textContent||'';setTimeout(()=>{btn.classList.remove('submitting-ui')},1800)},true);
createRoot(document.getElementById('root')).render(<React.StrictMode><HashRouter><AuthProvider><App/></AuthProvider></HashRouter></React.StrictMode>);

// Wide Persian tables keep an LTR scroll container for predictable browser
// scroll coordinates, while the table itself remains RTL. Move each newly
// rendered scroll area to its right edge once so the first visible columns are
// the logical beginning of the Persian table.
const rtlTableSelector='.report-table.table-swipe';
function initializeRtlTableScroll(container){
  if(!(container instanceof HTMLElement)||container.dataset.rtlStartInitialized==='1')return;
  const maxScroll=Math.max(0,container.scrollWidth-container.clientWidth);
  if(maxScroll<=1)return;
  container.scrollLeft=maxScroll;
  requestAnimationFrame(()=>{
    container.scrollLeft=Math.max(0,container.scrollWidth-container.clientWidth);
    container.dataset.rtlStartInitialized='1';
  });
}
function initializeRtlTableScrolls(){
  document.querySelectorAll(rtlTableSelector).forEach(initializeRtlTableScroll);
}
const rtlTableObserver=new MutationObserver(()=>requestAnimationFrame(initializeRtlTableScrolls));
rtlTableObserver.observe(document.getElementById('root'),{childList:true,subtree:true});
window.addEventListener('load',initializeRtlTableScrolls);
window.addEventListener('resize',initializeRtlTableScrolls);
setTimeout(initializeRtlTableScrolls,50);
setTimeout(initializeRtlTableScrolls,300);

// Register an app shell worker only in production. Business operations remain online-only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL}).catch(() => {});
  });
}
