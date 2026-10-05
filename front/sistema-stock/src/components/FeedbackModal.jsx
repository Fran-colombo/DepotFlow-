const FeedbackModal = ({ open, type = "success", message, onClose }) => {
  if (!open) return null;
  const success = type === "success";
  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1080 }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className={`modal-header ${success ? "bg-success text-white" : "bg-danger text-white"}`}>
            <h5 className="modal-title mb-0">{success ? "Éxito" : "Error"}</h5>
            <button type="button" className="btn-close btn-close-white" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <p className="mb-0">{message}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className={`btn ${success ? "btn-success" : "btn-danger"}`} onClick={onClose}>
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
