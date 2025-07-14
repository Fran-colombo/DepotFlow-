const MovementsModal = ({ item, isOpen, onClose, movements = [] }) => {
  if (!isOpen) return null;
  return (
    <div className="modal show d-block fade" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-clock-history me-2"></i>
              Historial de movimientos de: {item?.name}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <div className="modal-body bg-light">
            <div className="table-responsive">
              <table className="table table-hover table-bordered">
                <thead className="table-primary text-center">
                  <tr>
                    <th>Fecha</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Persona</th>
                    <th className="text-end">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length > 0 ? (
                    movements.map((mov) => (
                      <tr key={mov.id}>
                        <td>{mov.date}</td>
                        <td>{mov.from_shed_name}</td>
                        <td>{mov.to_shed_name}</td>
                        <td>{mov.username}</td>
                        <td className="text-end">{mov.quantity}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="text-center text-muted py-4">
                        <i className="bi bi-info-circle me-2"></i>
                        No hay movimientos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer bg-light">
            <button className="btn btn-outline-primary" onClick={onClose}>
              <i className="bi bi-x-lg me-1"></i>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MovementsModal;