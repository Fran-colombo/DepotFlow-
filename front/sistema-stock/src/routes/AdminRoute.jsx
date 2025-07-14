// import { useContext } from 'react';
// import { Navigate } from 'react-router-dom';
// import  AuthContext from '../context/AuthContext';

// export default function PrivateRoute({ children }) {
//   const { role } = useContext(AuthContext);
  
//   return role == "admin" ? children : <Navigate to="/" replace />;
// }

import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

export default function AdminRoute() {
  const { isAuthenticated, role } = useContext(AuthContext);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin') {
    return <Navigate to="/" replace state={{ error: 'Acceso no autorizado' }} />;
  }

  return <Outlet />;
}