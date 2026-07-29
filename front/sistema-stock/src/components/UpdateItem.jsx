import { useEffect, useState } from "react";
import { createItem, updateItem, getItems, getItemById } from "../api/items";
import { getSheds, getShedById } from "../api/sheds";
import { getZones } from "../api/zones";

const UpdateItemModal = ({
  isOpen,
  onClose,
  refreshItems,
  mode = "create",
  itemId = null,
}) => {
  const [items, setItems] = useState([]);
  const [lockedItem, setLockedItem] = useState(null);
  const [sheds, setSheds] = useState([]);
  const [zones, setZones] = useState([]);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    quantity: 1,
    category: "Materiales consumibles",
    shed_id: "",
    zone_id: "",
  });
  const [updateData, setUpdateData] = useState({
    item_id: "",
    quantity: 1,
    action: "add",
  });

  const isLockedToItem = mode === "update" && itemId != null;

  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setSearchTerm("");
    setLockedItem(null);
    setFormData({
      name: "",
      description: "",
      quantity: 1,
      category: "Materiales consumibles",
      shed_id: "",
      zone_id: "",
    });
    setUpdateData({
      item_id: itemId != null ? Number(itemId) : "",
      quantity: 1,
      action: "add",
    });

    if (mode === "create") {
      getSheds()
        .then((shedsData) => {
          setSheds(shedsData);
          if (shedsData.length > 0) {
            setFormData((prev) => ({
              ...prev,
              shed_id: shedsData[0].id,
            }));
          }
        })
        .catch((err) => console.error("Error cargando galpones:", err));
    }
  }, [isOpen, mode, itemId]);

  useEffect(() => {
    const loadZones = async () => {
      if (!isOpen || mode !== "create" || !formData.shed_id) {
        setZones([]);
        return;
      }
      try {
        const zonesData = await getZones(formData.shed_id);
        setZones(zonesData);
        setFormData((prev) => ({
          ...prev,
          zone_id: zonesData.some((z) => Number(z.id) === Number(prev.zone_id))
            ? prev.zone_id
            : zonesData[0]?.id || "",
        }));
      } catch (err) {
        console.error("Error cargando zonas:", err);
        setZones([]);
      }
    };
    loadZones();
  }, [formData.shed_id, isOpen, mode]);

  useEffect(() => {
    if (!isOpen || mode !== "update") return;

    setIsLoading(true);

    if (itemId != null) {
      getItemById(itemId)
        .then((res) => {
          setLockedItem(res.item || res);
          setUpdateData((prev) => ({ ...prev, item_id: Number(itemId) }));
        })
        .catch((err) => {
          console.error("Error cargando ítem:", err);
          setError("No se pudo cargar el producto");
        })
        .finally(() => setIsLoading(false));
      return;
    }

    getItems()
      .then(async (res) => {
        const itemsWithShedName = await Promise.all(
          (res.data || []).map(async (item) => {
            try {
              const shed = await getShedById(item.shed_id);
              return {
                ...item,
                shedName: shed?.name || "Sin galpón",
              };
            } catch {
              return { ...item, shedName: "Sin galpón" };
            }
          })
        );
        setItems(itemsWithShedName);
      })
      .catch((err) => {
        console.error("Error cargando items:", err);
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, mode, itemId]);

  useEffect(() => {
    if (!error) return;
    const timeout = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timeout);
  }, [error]);

  const categories = [
    { value: "Materiales consumibles", label: "Materiales consumibles" },
    {
      value: "Maquinas y herramientas eléctricas de mano",
      label: "Maq. y herramientas eléctricas de mano",
    },
    { value: "Prolongación", label: "Prolongación" },
    {
      value: "Maquinas y herramientas eléctricas de obra",
      label: "Maq. y herramientas eléctricas de obra",
    },
    {
      value: "Herramientas de obra general",
      label: "Herramientas de obra general",
    },
    { value: "Encofrados", label: "Encofrados" },
    { value: "Estructuras de hormigón", label: "Estructuras de hormigón" },
    { value: "Contrapisos", label: "Contrapisos" },
    { value: "Albañilería", label: "Albañilería" },
    { value: "Yesería", label: "Yesería" },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "create") {
        if (!formData.name || !formData.category || !formData.shed_id || !formData.zone_id) {
          setError("Nombre, categoría, depósito y zona son obligatorios");
          setIsLoading(false);
          return;
        }
        await createItem({
          ...formData,
          shed_id: Number(formData.shed_id),
          zone_id: Number(formData.zone_id),
        });
      } else {
        const { item_id, quantity, action } = updateData;
        if (!item_id || quantity <= 0 || !action) {
          setError("Ítem, cantidad y acción son obligatorios");
          setIsLoading(false);
          return;
        }
        await updateItem(updateData.item_id, {
          quantity: updateData.quantity,
          action: updateData.action,
        });
      }
      onClose();
      refreshItems?.();
    } catch (err) {
      setError(err.message || "Error al procesar la operación");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
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
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body px-4 py-3">
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
                        setFormData({
                          ...formData,
                          shed_id: e.target.value,
                          zone_id: "",
                        })
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

                  <div className="mb-3">
                    <label className="form-label fw-bold">Zona:</label>
                    <select
                      className="form-select"
                      value={formData.zone_id}
                      onChange={(e) =>
                        setFormData({ ...formData, zone_id: e.target.value })
                      }
                      required
                      disabled={!formData.shed_id || zones.length === 0}
                    >
                      <option value="">Seleccionar zona</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                    {formData.shed_id && zones.length === 0 && (
                      <div className="form-text text-danger">
                        Este depósito no tiene zonas. Créelas desde Gestión depósitos.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {isLockedToItem ? (
                    <div className="mb-3">
                      <label className="form-label fw-bold">Producto:</label>
                      <div className="form-control-plaintext fw-semibold px-0">
                        {lockedItem
                          ? `${lockedItem.name} (${lockedItem.actualAmount} disp.${
                              lockedItem.zone_name
                                ? ` — ${lockedItem.zone_name}`
                                : ""
                            })`
                          : "Cargando…"}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <label className="form-label fw-bold">
                          Buscar producto a actualizar:
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Buscar por nombre..."
                          value={searchTerm}
                          onChange={(e) =>
                            setSearchTerm(e.target.value.toLowerCase())
                          }
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Producto:</label>
                        <select
                          className="form-select"
                          value={updateData.item_id || ""}
                          onChange={(e) =>
                            setUpdateData({
                              ...updateData,
                              item_id: parseInt(e.target.value, 10),
                            })
                          }
                          required
                        >
                          <option value="">Seleccionar producto</option>
                          {items
                            .filter((item) =>
                              item.name.toLowerCase().includes(searchTerm)
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.actualAmount} disp. -{" "}
                                {item?.shedName || "Sin galpón"} /{" "}
                                {item.zone_name || "Sin zona"})
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  )}

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
                      required
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
                  onClick={onClose}
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
};

export default UpdateItemModal;
