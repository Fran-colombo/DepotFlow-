import  { useState, useEffect } from "react";
import {  useNavigate } from "react-router-dom";
import { getItemDetails, deleteProduct } from "../api/items";

const DeleteItemModal = ({ itemId, onSuccess, onClose }) => {
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const itemData = await getItemDetails(itemId);
  
        if (itemData.metadata.is_deleted) {
          navigate("/", { state: { error: "Este ítem ya fue eliminado" } });
          return;
        }

        setItem(itemData);
      } catch (err) {
        console.error("Error fetching item details:", err);
        navigate("/", { state: { error: err.message } });
      }
    };
    
    fetchItem();
  }, [itemId, navigate]);

const handleDelete = async () => {
  if (!description.trim()) {
    setError("Debes ingresar un motivo válido para eliminar el ítem");
    return;
  }

  setLoading(true);
  setError("");

  try {
    await deleteProduct({
      item_id: itemId,
      description: description.trim(),
      date: new Date().toISOString()
    });

    onClose();        
    onSuccess?.();    

  } catch (err) {
    setError(err.message || "Ocurrió un error al eliminar el ítem");
  } finally {
    setLoading(false);
  }
};


  if (!item) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

 return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
    <div className="modal-dialog modal-dialog-centered">
      <div
        className="modal-content border-0 shadow-lg"
        style={{
          background: "#ffff00",
          border: "1px solid #74c0fc",
          borderRadius: "1rem",
          boxShadow: "0 0 30px rgba(116, 192, 252, 0.2)",
          color: "#1c1c1c",
        }}
        >
      <div
        className="modal-header d-flex justify-content-center align-items-center"
        style={{
          background: "#FF0000",
          borderBottom: "1px solid #74c0fc",
          borderTopLeftRadius: "1rem",
          borderTopRightRadius: "1rem",
          padding: "1rem",
          textAlign: "center"
        }}
      >
        <h5 className="modal-title text-black fw-bold m-0">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          SOLO FERNANDO CATALDO ESTÁ AUTORIZADO A ELIMINAR PRODUCTOS
        </h5>
      </div>

        <div className="modal-body">
          <div
            className="alert d-flex align-items-center"
            style={{
              backgroundColor: "#e3fafc",
              border: "1px solid #99e9f2",
              color: "#0c8599",
              borderRadius: "0.5rem",
            }}
          >
            <i className="bi bi-exclamation-circle-fill me-2"></i>
            ¿Estás seguro que querés eliminar permanentemente el ítem: {" "}
            <strong>"{item.name}"</strong>?
          </div>

          {item.metadata?.deletion_info && (
            <div className="text-danger mb-2">
              <small>
                Este ítem fue eliminado anteriormente el:{" "}
                {new Date(item.metadata.deletion_info.deleted_at).toLocaleDateString()}
              </small>
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="deleteReason" className="form-label fw-semibold text-primary">
              <i className="bi bi-card-text me-2 text-info"></i>
              Motivo de eliminación:
            </label>
            <textarea
              id="deleteReason"
              className={`form-control shadow-sm ${
                error && !description ? "is-invalid" : ""
              }`}
              style={{ borderRadius: "0.5rem", borderColor: "#74c0fc" }}
              rows={4}
              placeholder="Ej: El equipo está dañado, ya no se usa..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError("");
              }}
              required
              disabled={loading}
            />
            <div className="form-text">Este motivo quedará registrado en el historial</div>
            {error && !description && (
              <div className="invalid-feedback">{error}</div>
            )}
          </div>

          {error && description && (
            <div className="alert alert-danger d-flex align-items-center">
              <i className="bi bi-x-circle-fill me-2"></i>
              <div>{error}</div>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            borderTop: "1px solid #74c0fc",
            backgroundColor: "#f8f9fa",
            borderBottomLeftRadius: "1rem",
            borderBottomRightRadius: "1rem",
          }}
        >
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} >
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            style={{
              backgroundColor: "#74c0fc",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              boxShadow: "0 0 10px rgba(116, 192, 252, 0.5)",
            }}
            onClick={handleDelete}
            disabled={loading || !description.trim()}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                Eliminando...
              </>
            ) : (
              <>
                <i className="bi bi-trash-fill me-2"></i>
                Confirmar eliminación
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  </div>
);
}

export default DeleteItemModal;