import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute, { SysadminRoute } from "./routes/AdminRoute"
import Historial from "./pages/Historial";
import Pendientes from "./pages/Pendientes";
import Login from "./pages/Login";
import SignUp from "./pages/Signup";
import AuthProvider from "./context/AuthProvider";
import Items from "./pages/Items";
import Piezas from "./pages/Piezas";
import Autos from "./pages/Autos";
import Existencias from "./pages/Existencias";
import DeletedItemsPage from "./pages/DeletedItem";
import UsersPage from "./pages/Users";
import WarehouseManagement from "./pages/WarehouseManagement";
import CategoriesPage from "./pages/Categories";
import ObrasPage from "./pages/Obras";
import EmpleadosPage from "./pages/Empleados";
import SysadminPage from "./pages/Sysadmin";
import Manual from "./pages/Manual";


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

          <Route path="/manual" element={
            <PrivateRoute>
              <Manual />
            </PrivateRoute>
          } />

          <Route path="/piezas" element={
            <PrivateRoute>
              <Piezas />
            </PrivateRoute>
          } />

          <Route path="/autos" element={
            <PrivateRoute>
              <Autos />
            </PrivateRoute>
          } />

          <Route path="/existencias" element={
            <PrivateRoute>
              <Existencias />
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
          <Route path="/admin/categories" element={<CategoriesPage />} />
          <Route path="/admin/obras" element={<ObrasPage />} />
          <Route path="/admin/empleados" element={<EmpleadosPage />} />
          <Route path="/admin/zones" element={<Navigate to="/admin/warehouses" replace />} />
          <Route path="/deleted-items" element={<DeletedItemsPage />} />

        </Route>
        <Route element={<SysadminRoute />}>
          <Route path="/admin/sysadmin" element={<SysadminPage />} />
        </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
