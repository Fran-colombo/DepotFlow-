// import { useEffect, useState } from "react";
// import { getItemById, retirarItem } from "../api/items";

// const RetirarItemModal = ({ itemId, isOpen, onClose, onSuccess }) => {
//   const [item, setItem] = useState(null);
//   const [form, setForm] = useState({ amount: '', place: '', personWhoTook: '' });
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");
  


//   useEffect(() => {
//     if (isOpen && itemId) {
//       getItemById(itemId).then(res => setItem(res.item)).catch(console.error);
//     }
//   }, [isOpen, itemId]);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     setError("");
//     try {
//       await retirarItem({
//         itemId,
//         amount: parseInt(form.amount),
//         place: form.place,
//         ...(form.personWhoTook && { personWhoTook: form.personWhoTook })
//       });
//       onSuccess?.();
//       onClose();
//     } catch (error) {
//     const message = error?.response?.data?.detail || error.message || 'Ocurrió un error';
//   setError(message);
// }finally {
//       setLoading(false);
//     }
//   };

//   if (!isOpen) return null;

//   return (
//     <div
//       className="modal show d-block fade"
//       tabIndex="-1"
//       style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
//       onClick={onClose} 
//     >
//       <div
//         className="modal-dialog modal-md modal-dialog-centered"
//         onClick={e => e.stopPropagation()} 
//       >
//         <div className="modal-content rounded shadow-lg">
//           <div className="modal-header bg-danger text-white">
//             <h5 className="modal-title">Retirar: {item?.name || "Cargando..."}</h5>
//             <button
//               type="button"
//               className="btn-close btn-close-white"
//               onClick={onClose}
//               disabled={loading}
//             ></button>
//           </div>
//           <div className="modal-body">
//             <form onSubmit={handleSubmit}>
//               <div className="mb-3">
//                 <label className="form-label">Cantidad a retirar</label>
//                 <input
//                   type="number"
//                   className="form-control"
//                   value={form.amount}
//                   onChange={(e) => setForm({ ...form, amount: e.target.value })}
//                   required
//                   min={1}
//                 />
//               </div>

//               <div className="mb-3">
//                 <label className="form-label">Lugar donde se usará</label>
//                 <input
//                   type="text"
//                   className="form-control"
//                   value={form.place}
//                   onChange={(e) => setForm({ ...form, place: e.target.value })}
//                   required
//                 />
//               </div>

//               <div className="mb-3">
//                 <label className="form-label">Persona que retira (si sos vos no pongas nada)</label>
//                 <input
//                   type="text"
//                   className="form-control"
//                   value={form.personWhoTook}
//                   onChange={(e) => setForm({ ...form, personWhoTook: e.target.value })}
//                 />
//               </div>
//               {error && (
//                 <div className="alert alert-danger py-2 px-3 mt-3 mb-0">
//                   {error}
//                 </div>
//                 )}
//               <div className="d-flex justify-content-end gap-2">
//                 <button
//                   type="button"
//                   className="btn btn-outline-secondary"
//                   onClick={onClose}
//                   disabled={loading}
//                 >
//                   Cancelar
//                 </button>
//                 <button type="submit" className="btn btn-danger" disabled={loading}>
//                   {loading ? (
//                     <>
//                       <span className="spinner-border spinner-border-sm me-2"></span>
//                       Procesando...
//                     </>
//                   ) : (
//                     "Confirmar Retiro"
//                   )}
//                 </button>
//               </div>
//             </form>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default RetirarItemModal;

import { useEffect, useState } from "react";
import { getItemById, getItemUnits, retirarItem } from "../api/items";
import { getObras } from "../api/obras";
import ObraPicker from "./ObraPicker";

const RetirarItemModal = ({ 
  itemId, 
  isOpen, 
  onClose, 
  onSuccess,
  onGenerateRemito // Nueva prop para manejar la generación del remito
}) => {
  const [item, setItem] = useState(null);
  const [stockUnits, setStockUnits] = useState([]);
  const [innerQuantity, setInnerQuantity] = useState(false);
  const [form, setForm] = useState({ amount: '', place: '', personWhoTook: '', code: '', scope: 'parcial', noReturn: false });
  const [retiredCodes, setRetiredCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRemitoConfirmation, setShowRemitoConfirmation] = useState(false);
  const [obras, setObras] = useState([]);

  const selectedUnit = stockUnits.find((unit) => unit.code === form.code);

  useEffect(() => {
    if (isOpen && itemId) {
      setForm({ amount: '', place: '', personWhoTook: '', code: '', scope: 'parcial', noReturn: false });
      setRetiredCodes([]);
      setStockUnits([]);
      setInnerQuantity(false);
      getItemById(itemId).then(res => setItem(res.item)).catch(console.error);
      getItemUnits(itemId, "en_stock")
        .then((data) => {
          setStockUnits(Array.isArray(data?.units) ? data.units : []);
          setInnerQuantity(Boolean(data?.inner_quantity));
        })
        .catch(() => setStockUnits([]));
      getObras().then((data) => setObras(Array.isArray(data) ? data : [])).catch(() => setObras([]));
    }
  }, [isOpen, itemId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (!form.place.trim()) {
        setError("Elegí una obra");
        setLoading(false);
        return;
      }
      let amount = parseInt(form.amount, 10);
      let codes;
      if (item?.track_units) {
        if (!form.code) {
          setError("Elegí un código");
          setLoading(false);
          return;
        }
        if (innerQuantity) {
          const available = selectedUnit?.quantity ?? 0;
          amount = form.scope === "total" ? available : amount;
          if (!amount || amount < 1 || amount > available) {
            setError(`Podés retirar hasta ${available}`);
            setLoading(false);
            return;
          }
        } else {
          amount = 1;
        }
        codes = [form.code];
      } else if (!amount || amount < 1) {
        setError("La cantidad tiene que ser mayor a 0");
        setLoading(false);
        return;
      }
      const result = await retirarItem({
        itemId,
        amount,
        place: form.place,
        ...(form.personWhoTook && { personWhoTook: form.personWhoTook }),
        ...(codes ? { codes } : {}),
        noReturn: Boolean(item?.is_consumable) || form.noReturn,
      });
      setRetiredCodes(result?.unit_codes || []);
      
      // Mostrar confirmación para remito
      setShowRemitoConfirmation(true);
      
      // No cerramos el modal todavía, solo limpiamos el formulario
      setForm({ amount: '', place: '', personWhoTook: '', code: '', scope: 'parcial', noReturn: false });
      
      // Llamamos a onSuccess para actualizar la lista
      onSuccess?.();
    } catch (error) {
      const message = error?.response?.data?.detail || error.message || 'Ocurrió un error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRemito = () => {
    setShowRemitoConfirmation(false);
    onClose();
    // Llamamos a la función para generar el remito con los datos del formulario
    onGenerateRemito?.({
      item,
      amount: form.amount,
      place: form.place,
      personWhoTook: form.personWhoTook || 'Usuario actual' // Puedes ajustar esto
    });
  };

  const handleCancelRemito = () => {
    setShowRemitoConfirmation(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal show d-block fade"
        tabIndex="-1"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose} 
      >
        <div
          className="modal-dialog modal-md modal-dialog-centered"
          onClick={e => e.stopPropagation()} 
        >
          <div className="modal-content rounded shadow-lg">
            <div className="modal-header bg-danger text-white">
              <h5 className="modal-title">Retirar: {item?.name || "Cargando..."}</h5>
              <button
                type="button"
                className="btn-close btn-close-white"
                onClick={onClose}
                disabled={loading}
              ></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                {!item?.track_units && (
                <div className="mb-3">
                  <label className="form-label">Cantidad a retirar</label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    min={1}
                  />
                </div>
                )}

                <div className="mb-3">
                  <label className="form-label">Obra</label>
                  <ObraPicker
                    obras={obras}
                    value={form.place}
                    onChange={(place) => setForm({ ...form, place })}
                  />
                </div>

                {item?.track_units && (
                  <div className="mb-3">
                    <label className="form-label">Código</label>
                    <select
                      className="form-select"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value, amount: "" })}
                    >
                      <option value="">Elegir código</option>
                      {stockUnits.map((unit) => (
                        <option key={unit.id} value={unit.code}>
                          {unit.code}{unit.name ? ` ${unit.name}` : ""}
                          {innerQuantity ? ` · ${unit.quantity ?? 0}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {item?.track_units && innerQuantity && form.code && (
                  <div className="mb-3">
                    <div className="form-check">
                      <input
                        id="retire-parcial"
                        type="radio"
                        className="form-check-input"
                        name="retire-scope"
                        checked={form.scope === "parcial"}
                        onChange={() => setForm({ ...form, scope: "parcial" })}
                      />
                      <label className="form-check-label" htmlFor="retire-parcial">Parcial</label>
                    </div>
                    <div className="form-check mb-2">
                      <input
                        id="retire-total"
                        type="radio"
                        className="form-check-input"
                        name="retire-scope"
                        checked={form.scope === "total"}
                        onChange={() => setForm({ ...form, scope: "total" })}
                      />
                      <label className="form-check-label" htmlFor="retire-total">Total</label>
                    </div>
                    {form.scope === "parcial" ? (
                      <input
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      />
                    ) : (
                      <div className="form-text">Se retiran los {selectedUnit?.quantity ?? 0} de este código.</div>
                    )}
                    {form.scope === "parcial" && (
                      <div className="form-text">En este código quedan {selectedUnit?.quantity ?? 0}.</div>
                    )}
                  </div>
                )}

                {item?.track_units && (
                  <div className="form-check mb-3">
                    <input
                      id="no-return"
                      type="checkbox"
                      className="form-check-input"
                      checked={Boolean(item?.is_consumable) || form.noReturn}
                      disabled={Boolean(item?.is_consumable)}
                      onChange={(e) => setForm({ ...form, noReturn: e.target.checked })}
                    />
                    <label className="form-check-label" htmlFor="no-return">
                      No vuelve al depósito
                    </label>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">Persona que retira (si sos vos no pongas nada)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.personWhoTook}
                    onChange={(e) => setForm({ ...form, personWhoTook: e.target.value })}
                  />
                </div>
                {error && (
                  <div className="alert alert-danger py-2 px-3 mt-3 mb-0">
                    {error}
                  </div>
                )}
                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={onClose}
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-danger" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Procesando...
                      </>
                    ) : (
                      "Confirmar Retiro"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmación para el remito */}
      {showRemitoConfirmation && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={handleCancelRemito}
        >
          <div
            className="modal-dialog modal-md modal-dialog-centered"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-content rounded shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">Generar remito</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={handleCancelRemito}
                ></button>
              </div>
              <div className="modal-body">
                <p>¿Deseas generar un remito por este retiro?</p>
                {retiredCodes.length > 0 && (
                  <p className="mb-0">
                    Códigos: <strong>{retiredCodes.join(", ")}</strong>
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelRemito}
                >
                  No, gracias
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateRemito}
                >
                  Sí, generar remito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RetirarItemModal;