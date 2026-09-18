import {NavLink,Outlet,useNavigate} from 'react-router-dom';import {useAuth} from '../context/AuthContext';
export default function Layout(){
  const {user,logout,isManager}=useAuth();const nav=useNavigate();
  const managerItems=[['/','داشبورد'],['/products','محصولات'],['/production','تولید و شیفت‌ها'],['/sales','فروش'],['/customers','مشتریان'],['/inventory','انبار'],['/reports','گزارش‌ها'],['/users','کاربران']];
  const operatorItems=[['/operator','پنل عملیات']];
  const items=isManager?managerItems:operatorItems;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><b>Boostan</b><span>Factory ERP</span></div><nav>{items.map(([to,label])=><NavLink key={to} to={to} end={to==='/' }>{label}</NavLink>)}</nav><div className="userbox"><div>{user?.fullName||user?.username}</div><small>{isManager?'مدیر':'اپراتور'}</small><button className="ghost" onClick={()=>{logout();nav('/login')}}>خروج</button></div></aside><main className="main"><Outlet/></main></div>;
}
