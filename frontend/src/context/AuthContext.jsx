import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import api from '../services/api';
const C=createContext(null);
export function AuthProvider({children}){
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('boostan_user'))||null}catch{return null}});
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const token=localStorage.getItem('boostan_token');
    if(!token){setReady(true);return;}
    api.get('/auth/me').then(r=>{localStorage.setItem('boostan_user',JSON.stringify(r.data));setUser(r.data)}).catch(()=>{localStorage.removeItem('boostan_token');localStorage.removeItem('boostan_user');setUser(null)}).finally(()=>setReady(true));
  },[]);
  function login(data){localStorage.setItem('boostan_token',data.token);localStorage.setItem('boostan_user',JSON.stringify(data.user));setUser(data.user);}
  function logout(){localStorage.removeItem('boostan_token');localStorage.removeItem('boostan_user');setUser(null);}
  const value=useMemo(()=>({user,login,logout,isManager:user?.role==='MANAGER',ready}),[user,ready]);
  if(!ready)return <div className="login-page"><div className="login-card"><div className="brand big"><b>کارخانه بوستان</b><span>در حال بررسی نشست...</span></div></div></div>;
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useAuth=()=>useContext(C);
