import { useEffect, useState } from "react";
import { createItem, updateItem, getItems } from "../api/items";
import { useNavigate } from "react-router-dom";
import { getSheds, getShedById } from "../api/sheds";

const UpdateItemModal = ({ isOpen, onClose, refreshItems }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState("create");
  const [items, setItems] = useState([]);
  const [sheds, setSheds] = useState([]);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); 
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    quantity: 1,
    category: "Materiales consumibles",
    shed_id: "",
  });
  const [updateData, setUpdateData] = useState({
    name: "",
    quantity: 1,
    action: "add",
  });

  useEffect(() => {
    if(isOpen){
    const loadSheds = async () => {
      try {
        const shedsData = await getSheds();
        setSheds(shedsData);
        if (shedsData.length > 0) {
          setFormData(prev => ({ ...prev, shed_id: shedsData[0].id }));
        }
      } catch (err) {
        console.error("Error cargando galpones:", err);
      }
    };

    loadSheds();}
  }, [isOpen]);

useEffect(() => {
  if (isOpen && mode === "update") {
    setIsLoading(true);
    getItems()
      .then(async (res) => {
        const itemsWithShedName = await Promise.all(
          res.data.map(async (item) => {
            const shed = await getShedById(item.shed_id);
            return {
              ...item,
              shedName: shed?.name || "Sin galpón",
            };
          })
        );
        setItems(itemsWithShedName);
      })
      .catch((err) => {
        console.error("Error cargando items:", err);
      })
      .finally(() => setIsLoading(false));
  }
}, [isOpen, mode]);


  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(""), 5000);
      return () => clearTimeout(timeout);
    }
  }, [error]);


  const categories = [
    {value: "Materiales consumibles", label: "Materiales consumibles" },
    {value: "Maquinas y herramientas eléctricas de mano", label: "Maq. y herramientas eléctricas de mano" },
    {value: "Prolongación", label: "Prolongación" },
    {value: "Maquinas y herramientas eléctricas de obra", label: "Maq. y herramientas eléctricas de obra" },
    {value: "Herramientas de obra general", label: "Herramientas de obra general" },
    {value: "Encofrados", label: "Encofrados"},
    {value:"Estructuras de hormigón", label:"Estructuras de hormigón"},
    {value:"Contrapisos", label:"Contrapisos"},
    {value:"Albañilería", label:"Albañilería"},
    {value:"Yesería", label:"Yesería"}
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "create") {
        if (!formData.name || !formData.category || !formData.shed_id) {
          setError("Nombre, categoría y galpón son obligatorios");
          setIsLoading(false);
          return;
        }
        console.log("Enviando formData:", formData);
        await createItem(formData);
      } else {
        const { item_id, quantity, action } = updateData;
        if (!item_id || quantity <= 0 || !action) {
          setError("Ítem, cantidad y acción son obligatorios");
          setIsLoading(false);
          return;
        }
        await updateItem(updateData.item_id, updateData);
      }
      onClose();
    refreshItems?.();
    } catch (err) {
      setError(err.message || "Error al procesar la operación");
    } finally {
      setIsLoading(false);
    }
  };

return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    
    >
    <div className="modal-dialog modal-dialog-centered" style={{ minWidth: "600px" }}>
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
            <i className="bi bi-box-seam me-2"></i>
            {mode === "create" ? "Crear nuevo ítem" : "Actualizar stock"}
          </h5>
          <button
            type="button"
            className="btn-close btn-close-white"
            onClick={() => navigate("/")}
          ></button>
        </div>

        <div className="modal-body px-4 py-3">
          <div className="mb-4">
            <label className="form-label fw-bold">Modo de operación</label>
            <select
              className="form-select"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="create">Crear nuevo ítem</option>
              <option value="update">Modificar stock existente</option>
            </select>
          </div>

          {error && <div className="alert alert-danger text-center">{error}</div>}

          <form onSubmit={handleSubmit}>
            {mode === "create" ? (
              <>
                <div className="mb-3">
                  <label className="form-label fw-bold">Nombre:</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Descripción:</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Cantidad:</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Categoría:</label>
                  <select
                    className="form-select"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    required
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Depósito:</label>
                  <select
                    className="form-select"
                    value={formData.shed_id}
                    onChange={(e) =>
                      setFormData({ ...formData, shed_id: e.target.value })
                    }
                    required
                  >
                    {sheds.map((shed) => (
                      <option key={shed.id} value={shed.id}>
                        {shed.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label fw-bold">Buscar producto a actualizar:</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Buscar por nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Producto:</label>
                  <select
                    className="form-select"
                    value={updateData.item_id}
                    onChange={(e) =>
                      setUpdateData({
                        ...updateData,
                        item_id: parseInt(e.target.value),
                      })
                    }
                  >
                    <option value="">Seleccionar producto</option>
                    {items
                      .filter((item) =>
                        item.name.toLowerCase().includes(searchTerm)
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.actualAmount} disp. - {item?.shedName || "Sin galpón"})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Cantidad:</label>
                  <input
                    type="number"
                    className="form-control"
                    min="1"
                    value={updateData.quantity}
                    onChange={(e) =>
                      setUpdateData({
                        ...updateData,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">Acción:</label>
                  <select
                    className="form-select"
                    value={updateData.action}
                    onChange={(e) =>
                      setUpdateData({ ...updateData, action: e.target.value })
                    }
                  >
                    <option value="add">Agregar stock</option>
                    <option value="rest">Quitar stock</option>
                  </select>
                </div>
              </>
            )}

            <div className="d-flex justify-content-end mt-3 gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => onClose()}
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                {isLoading
                  ? "Procesando..."
                  : mode === "create"
                  ? "Crear ítem"
                  : "Actualizar stock"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
);
}
export default UpdateItemModal;