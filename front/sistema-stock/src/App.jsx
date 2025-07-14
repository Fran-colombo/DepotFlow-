
// export default App;
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute"
// import Dashboard from "./pages/Dashboard";
import Historial from "./pages/Historial";
import Pendientes from "./pages/Pendientes";
import Login from "./pages/Login";
import SignUp from "./pages/Signup";
import AuthProvider from "./context/AuthProvider";
import Items from "./pages/Items";
// import RetirarItemPage from "./components/RetiroModal";
// import DevolverItemPage from "./components/DevolucionModal";
// import UpdateItemModal from "./components/UpdateItem";
// import SwitchShedModal from "./components/SwitchShedModal";
// import PackingSlipComponent from "./components/CrearRemito";
// import DeleteItemModal from "./components/DeleteItemModal";
import DeletedItemsPage from "./pages/DeletedItem";
import UsersPage from "./pages/Users";
// import ObservationsComponent from "./components/Observaciones";


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
{/* 
          <Route path="*" element={
            localStorage.getItem('token')
              ? <Navigate to="/" replace />
              : <Navigate to="/login" replace />
          } />
                <Route path="/admin/users" element={
        <PrivateRoute>
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        </PrivateRoute>
      } /> */}
              <Route element={<AdminRoute />}>
          <Route path="/admin/users" element={<UsersPage />} />
          {/* Otras rutas de admin */}
        </Route>

          {/* <Route path="/crear-item" element={<UpdateItemModal />} />
          <Route path="/retirar-item/:itemId" element={<RetirarItemPage />} />
          <Route path="/devolver-item/:itemId" element={<DevolverItemPage />} />
          <Route path="/mover-item/:itemId" element={<SwitchShedModal />} /> */}
          {/* <Route path="/crear-remito" element={<PackingSlipComponent />} /> */}
          {/* <Route path="delete-item/:itemId"  element={ <DeleteItemModal/>}/>  */}
          <Route path="deleted-items" element ={<DeletedItemsPage/>} />
          {/* <Route path="/observations/:itemId" element= {<ObservationsComponent/>}/> */}
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
