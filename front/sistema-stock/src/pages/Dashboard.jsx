import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import useAuth from "../hooks/useAuth"
import { Package, History, Clock, LogOut, Users, Trash2, Warehouse, Send } from "lucide-react"
import logoConkreto from '../assets/logo-conkreto.png';
import { createTelegramLink, getTelegramBot } from "../api/auth"

const Dashboard = ({ title, children }) => {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [telegramBot, setTelegramBot] = useState(null)
  const [openingTelegram, setOpeningTelegram] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

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

  const isActive = (path) => location.pathname === path

  const go = (path) => {
    setNavOpen(false)
    navigate(path)
  }

  const navLinkClass = (path) =>
    `btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-2 py-lg-1 app-nav-link w-100 ${
      isActive(path) ? "app-nav-link-active" : "text-secondary"
    }`

  return (
    <div className="min-vh-100 app-shell">
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom app-navbar">
        <div className="container-fluid px-3 px-md-4">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <span className="navbar-brand fw-semibold fs-6 fs-lg-5 text-dark mb-0 d-flex align-items-center gap-2 text-truncate">
              Gestión depósito
              <img src={logoConkreto} alt="Logo Conkreto" style={{ maxWidth: 36 }} />
            </span>
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
              <button onClick={() => go("/")} className={navLinkClass("/")}>
                <Package className="me-1" size={18} />
                Productos
              </button>

              <button onClick={() => go("/historial")} className={navLinkClass("/historial")}>
                <History className="me-1" size={18} />
                Historial
              </button>

              <button onClick={() => go("/pendientes")} className={navLinkClass("/pendientes")}>
                <Clock className="me-1" size={18} />
                Pendientes
              </button>

              <button onClick={() => go("/deleted-items")} className={navLinkClass("/deleted-items")}>
                <Trash2 className="me-1" size={18} />
                Eliminados
              </button>

              <button
                type="button"
                onClick={openTelegram}
                disabled={openingTelegram}
                className="btn btn-link text-decoration-none d-flex align-items-center fs-6 px-2 py-2 py-lg-1 text-secondary w-100"
              >
                <Send className="me-1" size={18} />
                {openingTelegram ? "Abriendo…" : "Telegram"}
              </button>

              {role === "admin" && (
                <>
                  <span className="d-none d-lg-inline app-nav-divider" />
                  <button onClick={() => go("/admin/users")} className={navLinkClass("/admin/users")}>
                    <Users className="me-1" size={18} />
                    Gestión usuarios
                  </button>
                  <button
                    onClick={() => go("/admin/warehouses")}
                    className={navLinkClass("/admin/warehouses")}
                  >
                    <Warehouse className="me-1" size={18} />
                    Gestión depósitos
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
