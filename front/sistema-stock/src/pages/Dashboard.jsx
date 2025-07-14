import { useNavigate, useLocation } from "react-router-dom"
import useAuth from "../hooks/useAuth"
import { Package, History, Clock, LogOut, Users, Trash2 } from "lucide-react"
import logoConkreto from '../assets/logo-conkreto.png';

const Dashboard = ({ title, children }) => {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm border-bottom py-3">
        <div className="container-fluid px-4">
          <div className="d-flex align-items-center">
            
            <span className="navbar-brand fw-bold fs-4 text-dark mb-0">Gestión depósito <img src={logoConkreto} alt="Logo Conkreto" style={{ maxWidth: 50 }} /></span>
          </div>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNav"
            aria-controls="navbarNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <div className="ms-auto d-flex align-items-center flex-wrap gap-3">
              <button
                onClick={() => navigate("/")}
                className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                  isActive("/") ? "fw-bold text-primary" : "text-dark"
                }`}
              >
                <Package className="me-2" size={20} />
                Productos
              </button>

              <button
                onClick={() => navigate("/historial")}
                className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                  isActive("/historial") ? "fw-bold text-primary" : "text-dark"
                }`}
              >
                <History className="me-2" size={20} />
                Historial
              </button>

              <button
                onClick={() => navigate("/pendientes")}
                className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                  isActive("/pendientes") ? "fw-bold text-primary" : "text-dark"
                }`}
              >
                <Clock className="me-2" size={20} />
                Pendientes
              </button>

              <button
                onClick={() => navigate("/deleted-items")}
                className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                  isActive("/deleted-items") ? "fw-bold text-primary" : "text-dark"
                }`}
              >
                <Trash2 className="me-2" size={20} />
                Eliminados
              </button>
              {role === 'admin' && (
                <div>
                <button
                  onClick={() => navigate("/admin/users")}
                  className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                    isActive("/admin/users") ? "fw-bold text-primary" : "text-dark"
                  }`}
                >
                  <Users className="me-2" size={20} />
                  Usuarios
                </button>
                <button
                  onClick={() => navigate("/signup")}
                  className={`btn btn-link text-decoration-none d-flex align-items-center fs-5 px-2 ${
                    isActive("/signup") ? "fw-bold text-primary" : "text-dark"
                  }`}
                >
                  
                  Crear usuario
                </button>
                </div>
              )}

              <button
                onClick={logout}
                className="btn btn-link text-decoration-none d-flex align-items-center text-danger fs-5 px-2"
              >
                <LogOut className="me-2" size={20} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="container my-5 px-4">
        <div className="card shadow-sm border-0">
          <div className="card-body py-5 px-4">
            <h2 className="h3 fw-semibold mb-4">{title}</h2>
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Dashboard