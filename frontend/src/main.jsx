import React from 'react';import {createRoot} from 'react-dom/client';import {HashRouter} from 'react-router-dom';import App from './App';import {AuthProvider} from './context/AuthContext';import {normalizeDigits} from './utils/fa';import './styles.css';

document.addEventListener('input',e=>{const el=e.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)||el.dataset.groupedNumber==='true')return;const normalized=normalizeDigits(el.value);if(normalized!==el.value){const start=el.selectionStart;el.value=normalized;el.dispatchEvent(new Event('change',{bubbles:true}));try{el.setSelectionRange(start,start)}catch{}}},true);
document.addEventListener('submit',e=>{const btn=e.submitter;if(!(btn instanceof HTMLButtonElement))return;btn.classList.add('submitting-ui');btn.dataset.originalText=btn.textContent||'';setTimeout(()=>{btn.classList.remove('submitting-ui')},1800)},true);
createRoot(document.getElementById('root')).render(<React.StrictMode><HashRouter><AuthProvider><App/></AuthProvider></HashRouter></React.StrictMode>);

// Register an app shell worker only in production. Business operations remain online-only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL}).catch(() => {});
  });
}
