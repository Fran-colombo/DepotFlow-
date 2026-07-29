import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute"
import Historial from "./pages/Historial";
import Pendientes from "./pages/Pendientes";
import Login from "./pages/Login";
import SignUp from "./pages/Signup";
import AuthProvider from "./context/AuthProvider";
import Items from "./pages/Items";
import DeletedItemsPage from "./pages/DeletedItem";
import UsersPage from "./pages/Users";
import WarehouseManagement from "./pages/WarehouseManagement";


function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
           <Route element={<AdminRoute />}>
          <Route path="/signup" element={<SignUp />} />
           </Route>

          <Route path="/" element={
            <PrivateRoute>
              <Items/>
            </PrivateRoute>
          } />

          <Route path="/historial" element={
            <PrivateRoute>
              <Historial />
            </PrivateRoute>
          } />

          <Route path="/pendientes" element={
            <PrivateRoute>
              <Pendientes />
            </PrivateRoute>
          } />

              <Route element={<AdminRoute />}>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/warehouses" element={<WarehouseManagement />} />
          <Route path="/admin/zones" element={<Navigate to="/admin/warehouses" replace />} />

        </Route>
          <Route path="deleted-items" element ={<DeletedItemsPage/>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
