import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getUsers, deleteUser, updateUserPassword, updateUserPhone, updateUserTelegram } from "../api/auth";
import Dashboard from "./Dashboard";

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    name: "",
    email: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [passwordModal, setPasswordModal] = useState({
    open: false,
    user: null,
    password: "",
    saving: false,
  });
  const [phoneModal, setPhoneModal] = useState({
    open: false,
    user: null,
    phone: "",
    saving: false,
  });
  const [telegramModal, setTelegramModal] = useState({
    open: false,
    user: null,
    telegramId: "",
    saving: false,
  });
  const [feedbackModal, setFeedbackModal] = useState({
    open: false,
    type: "success", // success | error
    message: "",
  });

  const navigate = useNavigate();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, total, page, page_size, total_pages } = await getUsers({
        ...filters,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      setUsers(data);
      setPagination({
        page,
        pageSize: page_size,
        total,
        totalPages: total_pages,
      });
      setError("");
    } catch (err) {
      const message =
        err.message === "Not Found"
          ? "El front no está hablando con este backend. En local usá el puerto 8001 (otro sistema ocupa el 8000)."
          : err.message;
      setError(message);
      if (err.message.includes("autorizados")) {
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [filters, pagination.page, pagination.pageSize]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setPagination((prev) => ({ ...prev, pageSize: newSize, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("¿Estás seguro de desactivar este usuario?")) return;

    try {
      await deleteUser(userId);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const openPasswordModal = (user) => {
    setPasswordModal({ open: true, user, password: "", saving: false });
  };

  const closePasswordModal = () => {
    setPasswordModal({ open: false, user: null, password: "", saving: false });
  };

  const openPhoneModal = (user) => {
    setPhoneModal({ open: true, user, phone: user.phone || "", saving: false });
  };

  const closePhoneModal = () => {
    setPhoneModal({ open: false, user: null, phone: "", saving: false });
  };

  const openTelegramModal = (user) => {
    setTelegramModal({
      open: true,
      user,
      telegramId: user.telegram_id || "",
      saving: false,
    });
  };

  const closeTelegramModal = () => {
    setTelegramModal({ open: false, user: null, telegramId: "", saving: false });
  };

  const handleUpdateTelegram = async (e) => {
    e.preventDefault();
    if (!telegramModal.user) return;
    const userLabel = `${telegramModal.user.name} ${telegramModal.user.surname}`.trim();
    setTelegramModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateUserTelegram(telegramModal.user.id, telegramModal.telegramId.trim());
      closeTelegramModal();
      setFeedbackModal({
        open: true,
        type: "success",
        message: `El Telegram ID de ${userLabel} se actualizó correctamente.`,
      });
      fetchUsers();
    } catch (err) {
      setTelegramModal((prev) => ({ ...prev, saving: false }));
      setFeedbackModal({
        open: true,
        type: "error",
        message: err.message || "No se pudo actualizar el Telegram ID.",
      });
    }
  };

  const handleUpdatePhone = async (e) => {
    e.preventDefault();
    if (!phoneModal.user) return;
    const userLabel = `${phoneModal.user.name} ${phoneModal.user.surname}`.trim();
    setPhoneModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateUserPhone(phoneModal.user.id, phoneModal.phone.trim());
      closePhoneModal();
      setFeedbackModal({
        open: true,
        type: "success",
        message: `El teléfono de ${userLabel} se actualizó correctamente.`,
      });
      fetchUsers();
    } catch (err) {
      setPhoneModal((prev) => ({ ...prev, saving: false }));
      setFeedbackModal({
        open: true,
        type: "error",
        message: err.message || "No se pudo actualizar el teléfono.",
      });
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!passwordModal.user) return;
    if (!passwordModal.password || passwordModal.password.length < 8) {
      setFeedbackModal({
        open: true,
        type: "error",
        message: "La contraseña debe tener al menos 8 caracteres.",
      });
      return;
    }

    const userLabel = `${passwordModal.user.name} ${passwordModal.user.surname}`.trim();
    setPasswordModal((prev) => ({ ...prev, saving: true }));
    try {
      await updateUserPassword(passwordModal.user.id, passwordModal.password);
      closePasswordModal();
      setFeedbackModal({
        open: true,
        type: "success",
        message: `La contraseña de ${userLabel} se actualizó correctamente.`,
      });
    } catch (err) {
      setPasswordModal((prev) => ({ ...prev, saving: false }));
      setFeedbackModal({
        open: true,
        type: "error",
        message: err.message || "No se pudo actualizar la contraseña.",
      });
    }
  };

  return (
    <Dashboard>
      <div>
        <div className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center mb-3">
          <h2 className="h4 mb-0">Gestión de usuarios</h2>
          <button
            className="btn btn-success d-flex align-items-center justify-content-center gap-2 shadow-sm"
            onClick={() => navigate("/signup")}
          >
            <i className="bi bi-plus-circle" />
            Crear usuario
          </button>
        </div>

        <div className="card mb-4 shadow-sm">
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Nombre</label>
                <input
                  type="text"
                  name="name"
                  value={filters.name}
                  onChange={handleFilterChange}
                  className="form-control"
                  placeholder="Filtrar por nombre"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input
                  type="text"
                  name="email"
                  value={filters.email}
                  onChange={handleFilterChange}
                  className="form-control"
                  placeholder="Filtrar por email"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center my-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Cargando...</span>
            </div>
          </div>
        ) : error ? (
          <div className="alert alert-danger">{error}</div>
        ) : (
          <>
            <div className="d-md-none d-flex flex-column gap-3">
              {users.map((user) => (
                <div key={user.id} className="border rounded-3 p-3">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div>
                      <div className="fw-semibold">
                        {user.name} {user.surname}
                      </div>
                      <div className="text-muted small">{user.email}</div>
                    </div>
                    <span
                      className={`badge ${
                        user.role === "admin" ? "bg-danger" : "bg-primary"
                      }`}
                    >
                      {user.role === "admin" ? "Admin" : "Usuario"}
                    </span>
                  </div>
                  <div className="small mb-3">
                    Teléfono: {user.phone || "—"}
                    <br />
                    Telegram: {user.telegram_id || "—"}
                  </div>
                  <div className="d-grid gap-2">
                    <button
                      type="button"
                      onClick={() => openPhoneModal(user)}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Teléfono
                    </button>
                    <button
                      type="button"
                      onClick={() => openTelegramModal(user)}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      Telegram
                    </button>
                    <button
                      type="button"
                      onClick={() => openPasswordModal(user)}
                      className="btn btn-sm btn-outline-primary"
                    >
                      Cambiar contraseña
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user.id)}
                      className="btn btn-sm btn-outline-danger"
                      disabled={user.role === "admin"}
                    >
                      Desactivar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="table-responsive d-none d-md-block">
              <table className="table table-striped table-hover">
                <thead className="table-dark">
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Telegram</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>
                        {user.name} {user.surname}
                      </td>
                      <td>{user.email}</td>
                      <td>{user.phone || "—"}</td>
                      <td>{user.telegram_id || "—"}</td>
                      <td>
                        <span
                          className={`badge ${
                            user.role === "admin" ? "bg-danger" : "bg-primary"
                          }`}
                        >
                          {user.role === "admin" ? "Admin" : "Usuario"}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-success">Activo</span>
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => openPhoneModal(user)}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Teléfono
                          </button>
                          <button
                            type="button"
                            onClick={() => openTelegramModal(user)}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Telegram
                          </button>
                          <button
                            type="button"
                            onClick={() => openPasswordModal(user)}
                            className="btn btn-sm btn-outline-primary"
                          >
                            Contraseña
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user.id)}
                            className="btn btn-sm btn-outline-danger"
                            disabled={user.role === "admin"}
                          >
                            Desactivar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex flex-column flex-sm-row gap-2 justify-content-between align-items-stretch align-items-sm-center mt-3">
              <div>
                <select
                  value={pagination.pageSize}
                  onChange={handlePageSizeChange}
                  className="form-select form-select-sm"
                >
                  <option value="10">10 por página</option>
                  <option value="20">20 por página</option>
                  <option value="50">50 por página</option>
                  <option value="100">100 por página</option>
                </select>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="btn btn-sm btn-outline-primary"
                >
                  Anterior
                </button>

                <span>
                  Página {pagination.page} de {pagination.totalPages}
                </span>

                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-sm btn-outline-primary"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {passwordModal.open && passwordModal.user && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={closePasswordModal}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <form onSubmit={handleUpdatePassword}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    Cambiar contraseña — {passwordModal.user.name}{" "}
                    {passwordModal.user.surname}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closePasswordModal}
                  ></button>
                </div>
                <div className="modal-body">
                  <label className="form-label">Nueva contraseña</label>
                  <input
                    type="password"
                    className="form-control"
                    value={passwordModal.password}
                    onChange={(e) =>
                      setPasswordModal((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    minLength={8}
                    required
                    autoFocus
                  />
                  <div className="form-text">Mínimo 8 caracteres.</div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closePasswordModal}
                    disabled={passwordModal.saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={passwordModal.saving}
                  >
                    {passwordModal.saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {phoneModal.open && phoneModal.user && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={closePhoneModal}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <form onSubmit={handleUpdatePhone}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    Teléfono WhatsApp — {phoneModal.user.name}{" "}
                    {phoneModal.user.surname}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closePhoneModal}
                  ></button>
                </div>
                <div className="modal-body">
                  <label className="form-label">Número</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={phoneModal.phone}
                    onChange={(e) =>
                      setPhoneModal((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+54 9 11 1234-5678"
                    autoFocus
                  />
                  <div className="form-text">
                    Vacío quita el número. Se guarda en formato internacional.
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closePhoneModal}
                    disabled={phoneModal.saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={phoneModal.saving}
                  >
                    {phoneModal.saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {telegramModal.open && telegramModal.user && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={closeTelegramModal}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <form onSubmit={handleUpdateTelegram}>
                <div className="modal-header">
                  <h5 className="modal-title">
                    Telegram ID — {telegramModal.user.name}{" "}
                    {telegramModal.user.surname}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closeTelegramModal}
                  ></button>
                </div>
                <div className="modal-body">
                  <label className="form-label">ID numérico</label>
                  <input
                    type="text"
                    className="form-control"
                    value={telegramModal.telegramId}
                    onChange={(e) =>
                      setTelegramModal((prev) => ({
                        ...prev,
                        telegramId: e.target.value,
                      }))
                    }
                    placeholder="123456789"
                    autoFocus
                  />
                  <div className="form-text">
                    Que le escriba al bot: le responde su ID. Vacío lo desvincula.
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeTelegramModal}
                    disabled={telegramModal.saving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={telegramModal.saving}
                  >
                    {telegramModal.saving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.open && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setFeedbackModal({ open: false, type: "success", message: "" })}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div
                className={`modal-header ${
                  feedbackModal.type === "success"
                    ? "bg-success text-white"
                    : "bg-danger text-white"
                }`}
              >
                <h5 className="modal-title">
                  {feedbackModal.type === "success" ? "Éxito" : "Error"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() =>
                    setFeedbackModal({ open: false, type: "success", message: "" })
                  }
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-0">{feedbackModal.message}</p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className={`btn ${
                    feedbackModal.type === "success" ? "btn-success" : "btn-danger"
                  }`}
                  onClick={() =>
                    setFeedbackModal({ open: false, type: "success", message: "" })
                  }
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dashboard>
  );
};

export default UsersPage;
