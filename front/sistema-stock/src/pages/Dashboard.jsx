import { useEffect, useRef, useState } from "react"
import { useNavigate, useLocation, NavLink, Link } from "react-router-dom"
import useAuth from "../hooks/useAuth"
import { Package, LayoutGrid, ClipboardList, History, Clock, LogOut, Users, Trash2, Warehouse, Send, Tags, MapPin, ChevronDown, Wrench, UserRound, Car, BookOpen, Mail } from "lucide-react"
import logoConkreto from '../assets/logo-conkreto.png';
import { createTelegramLink, getTelegramBot } from "../api/auth"

const Dashboard = ({ title, children }) => {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const adminMenuRef = useRef(null)
  const [telegramBot, setTelegramBot] = useState(null)
  const [openingTelegram, setOpeningTelegram] = useState(false)
  const [accessMessage, setAccessMessage] = useState(location.state?.error || "")

  useEffect(() => {
    setNavOpen(false)
    setAdminOpen(false)
    if (location.state?.error) {
      setAccessMessage(location.state.error)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (!adminOpen) return
    const close = (event) => {
      if (!adminMenuRef.current?.contains(event.target)) setAdminOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [adminOpen])

  useEffect(() => {
    let cancelled = false
    getTelegramBot()
      .then((data) => {
        if (!cancelled) setTelegramBot(data)
      })
      .catch(() => {
        if (!cancelled) setTelegramBot(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openTelegram = async () => {
    if (openingTelegram) return
    setOpeningTelegram(true)
    try {
      const data = await createTelegramLink()
      window.open(data.url, "_blank", "noopener,noreferrer")
    } catch (err) {
      if (telegramBot?.url) {
        window.open(telegramBot.url, "_blank", "noopener,noreferrer")
      } else {
        window.alert(err.message || "No se pudo abrir Telegram.")
      }
    } finally {
      setOpeningTelegram(false)
    }
  }

  const closeNav = () => setNavOpen(false)

  const navLinkClass = ({ isActive }) =>
    `btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-2 py-lg-1 app-nav-link w-100 ${
      isActive ? "app-nav-link-active" : "text-secondary"
    }`

  return (
    <div className="min-vh-100 app-shell">
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom app-navbar">
        <div className="container-fluid px-3 px-md-4">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <Link
              to="/"
              className="navbar-brand fw-semibold fs-6 fs-lg-5 text-dark mb-0 d-flex align-items-center gap-2 text-truncate text-decoration-none"
              onClick={closeNav}
            >
              Gestión depósito
              <img src={logoConkreto} alt="Logo Conkreto" style={{ maxHeight: 40, width: "auto" }} />
            </Link>
          </div>
          <button
            className="navbar-toggler"
            type="button"
            aria-controls="navbarNav"
            aria-expanded={navOpen}
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className={`navbar-collapse ${navOpen ? "d-block" : "collapse"}`} id="navbarNav">
            <div className="ms-lg-auto d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-1 gap-lg-2 pt-2 pt-lg-0">
              <NavLink to="/manual" className={navLinkClass} onClick={closeNav}>
                <BookOpen className="me-1" size={18} />
                Manual de uso
              </NavLink>

              <NavLink to="/" end className={navLinkClass} onClick={closeNav}>
                <Package className="me-1" size={18} />
                Productos
              </NavLink>

              <NavLink to="/piezas" className={navLinkClass} onClick={closeNav}>
                <LayoutGrid className="me-1" size={18} />
                Piezas
              </NavLink>

              <NavLink to="/autos" className={navLinkClass} onClick={closeNav}>
                <Car className="me-1" size={18} />
                Autos
              </NavLink>

              <NavLink to="/existencias" className={navLinkClass} onClick={closeNav}>
                <ClipboardList className="me-1" size={18} />
                Existencias
              </NavLink>

              <NavLink to="/historial" className={navLinkClass} onClick={closeNav}>
                <History className="me-1" size={18} />
                Historial
              </NavLink>

              <NavLink to="/pendientes" className={navLinkClass} onClick={closeNav}>
                <Clock className="me-1" size={18} />
                Pendientes
              </NavLink>

              <button
                type="button"
                onClick={openTelegram}
                disabled={openingTelegram}
                className="btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-2 py-lg-1 text-secondary w-100"
              >
                <Send className="me-1" size={18} />
                {openingTelegram ? "Abriendo…" : "Telegram"}
              </button>

              {(role === "admin" || role === "sysadmin") && (
                <div className="dropdown" ref={adminMenuRef}>
                  <button
                    className="btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-2 py-lg-1 text-secondary w-100"
                    type="button"
                    aria-expanded={adminOpen}
                    onClick={() => setAdminOpen((open) => !open)}
                  >
                    <ChevronDown className="me-1" size={18} />
                    Administración
                  </button>
                  <ul className={`dropdown-menu dropdown-menu-end${adminOpen ? " show" : ""}`}>
                    <li>
                      <Link to="/admin/obras" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <MapPin className="me-2" size={16} /> Obras
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/empleados" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <UserRound className="me-2" size={16} /> Empleados
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/categories" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <Tags className="me-2" size={16} /> Categorías
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/warehouses" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <Warehouse className="me-2" size={16} /> Depósitos
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/users" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <Users className="me-2" size={16} /> Usuarios
                      </Link>
                    </li>
                    <li>
                      <Link to="/admin/reportes" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <Mail className="me-2" size={16} /> Reportes
                      </Link>
                    </li>
                    <li>
                      <Link to="/deleted-items" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                        <Trash2 className="me-2" size={16} /> Eliminados
                      </Link>
                    </li>
                    {role === "sysadmin" && (
                      <li>
                        <Link to="/admin/sysadmin" className="dropdown-item d-flex align-items-center" onClick={closeNav}>
                          <Wrench className="me-2" size={16} /> Sysadmin
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
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
          {accessMessage && (
            <div className="alert alert-warning py-2" role="alert">
              {accessMessage}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}

export default Dashboard
