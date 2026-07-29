import { useNavigate, useLocation } from "react-router-dom"
import useAuth from "../hooks/useAuth"
import { Package, History, Clock, LogOut, Users, Trash2, Warehouse, UserPlus } from "lucide-react"
import logoConkreto from '../assets/logo-conkreto.png';

const Dashboard = ({ title, children }) => {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => location.pathname === path

  const navLinkClass = (path) =>
    `btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-1 app-nav-link ${
      isActive(path) ? "app-nav-link-active" : "text-secondary"
    }`

  return (
    <div className="min-vh-100 app-shell">
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom app-navbar">
        <div className="container-fluid px-4">
          <div className="d-flex align-items-center gap-2">
            <span className="navbar-brand fw-semibold fs-5 text-dark mb-0 d-flex align-items-center gap-2">
              Gestión depósito
              <img src={logoConkreto} alt="Logo Conkreto" style={{ maxWidth: 40 }} />
            </span>
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
            <div className="ms-auto d-flex align-items-center flex-wrap gap-1 gap-lg-2">
              <button onClick={() => navigate("/")} className={navLinkClass("/")}>
                <Package className="me-1" size={18} />
                Productos
              </button>

              <button onClick={() => navigate("/historial")} className={navLinkClass("/historial")}>
                <History className="me-1" size={18} />
                Historial
              </button>

              <button onClick={() => navigate("/pendientes")} className={navLinkClass("/pendientes")}>
                <Clock className="me-1" size={18} />
                Pendientes
              </button>

              <button onClick={() => navigate("/deleted-items")} className={navLinkClass("/deleted-items")}>
                <Trash2 className="me-1" size={18} />
                Eliminados
              </button>

              {role === "admin" && (
                <>
                  <span className="d-none d-lg-inline app-nav-divider" />
                  <button onClick={() => navigate("/admin/users")} className={navLinkClass("/admin/users")}>
                    <Users className="me-1" size={18} />
                    Usuarios
                  </button>
                  <button
                    onClick={() => navigate("/admin/warehouses")}
                    className={navLinkClass("/admin/warehouses")}
                  >
                    <Warehouse className="me-1" size={18} />
                    Gestión depósitos
                  </button>
                  <button onClick={() => navigate("/signup")} className={navLinkClass("/signup")}>
                    <UserPlus className="me-1" size={18} />
                    Crear usuario
                  </button>
                </>
              )}

              <button
                onClick={logout}
                className="btn btn-link text-decoration-none d-flex align-items-center text-danger fs-6 px-2 py-1"
              >
                <LogOut className="me-1" size={18} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="container-xl my-4 my-md-5 px-3 px-md-4">
        <div className="app-page-card">
          {title && <h1 className="app-page-title">{title}</h1>}
          {children}
        </div>
      </main>
    </div>
  )
}

export default Dashboard
