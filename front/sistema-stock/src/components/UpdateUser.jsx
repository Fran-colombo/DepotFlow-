import { useState, useEffect } from "react";
import { changePassword } from "../api/auth";

const UpdateUserPasswordModal = ({ isOpen, onClose, userId, userFullName, onSuccess }) => {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setNewPassword("");
      setError("");
      setShowPassword(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 7) {
      return setError("La contraseña debe tener al menos 8 caracteres");
    }

    try {
      setLoading(true);
      await changePassword(userId, newPassword);
      setLoading(false);
      onClose();
      onSuccess?.();
    } catch (err) {
      setLoading(false);
      setError(err.message || "Error al cambiar la contraseña");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ minWidth: "500px" }}>
        <div
          className="modal-content border-0 shadow-lg"
          style={{
            background: "#ffffff",
            border: "1px solid #339af0",
            borderRadius: "1rem",
            boxShadow: "0 0 30px rgba(51, 154, 240, 0.3)",
            color: "#1c1c1c",
          }}
        >
          <div
            className="modal-header"
            style={{
              backgroundColor: "#228be6",
              color: "white",
              borderTopLeftRadius: "1rem",
              borderTopRightRadius: "1rem",
            }}
          >
            <h5 className="modal-title">
              <i className="bi bi-lock me-2"></i>
              Cambiar contraseña de {userFullName}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body px-4 py-3">
            {error && <div className="alert alert-danger text-center">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label fw-bold">Nueva contraseña:</label>
                <div className="input-group">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                  </button>
                </div>
              </div>

              <div className="d-flex justify-content-end mt-3 gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Guardando..." : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateUserPasswordModal;
