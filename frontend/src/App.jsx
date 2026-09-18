import {Routes,Route,Navigate} from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Production from './pages/Production';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Users from './pages/Users';
import OperatorPanel from './pages/OperatorPanel';
import {useAuth} from './context/AuthContext';
export default function App(){
  const {user}=useAuth();
  const home=user?.role==='MANAGER'?'/':'/operator';
  return <Routes>
    <Route path="/login" element={user?<Navigate to={home} replace/>:<Login/>}/>
    <Route element={<ProtectedRoute><Layout/></ProtectedRoute>}>
      <Route index element={<ProtectedRoute role="MANAGER"><Dashboard/></ProtectedRoute>}/>
      <Route path="operator" element={<ProtectedRoute role="OPERATOR"><OperatorPanel/></ProtectedRoute>}/>
      <Route path="products" element={<ProtectedRoute role="MANAGER"><Products/></ProtectedRoute>}/>
      <Route path="production" element={<ProtectedRoute role="MANAGER"><Production/></ProtectedRoute>}/>
      <Route path="sales" element={<ProtectedRoute role="MANAGER"><Sales/></ProtectedRoute>}/>
      <Route path="customers" element={<ProtectedRoute role="MANAGER"><Customers/></ProtectedRoute>}/>
      <Route path="inventory" element={<ProtectedRoute role="MANAGER"><Inventory/></ProtectedRoute>}/>
      <Route path="reports" element={<ProtectedRoute role="MANAGER"><Reports/></ProtectedRoute>}/>
      <Route path="users" element={<ProtectedRoute role="MANAGER"><Users/></ProtectedRoute>}/>
    </Route>
    <Route path="*" element={<Navigate to={user?home:'/login'} replace/>}/>
  </Routes>;
}
