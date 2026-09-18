import axios from 'axios';

const api=axios.create({
  baseURL:import.meta.env.VITE_API_URL||'http://localhost:5000/api',
  timeout:20000
});

api.interceptors.request.use(c=>{
  const t=localStorage.getItem('boostan_token');
  if(t)c.headers.Authorization=`Bearer ${t}`;
  return c;
});

api.interceptors.response.use(r=>r,e=>{
  if(e.response?.status===401&&!String(e.config?.url||'').includes('/auth/login')){
    localStorage.removeItem('boostan_token');
    localStorage.removeItem('boostan_user');
    window.location.hash='#/login';
  }
  return Promise.reject(e);
});
export default api;
