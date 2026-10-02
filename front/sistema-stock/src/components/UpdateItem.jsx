import { useEffect, useState } from "react";
import { createItem, updateItem, getItems, getItemById, getNextCodes, suggestPrefix } from "../api/items";
import { getCategories } from "../api/categories";
import { getSheds, getShedById } from "../api/sheds";
import { getZones } from "../api/zones";
import { printLabels } from "./printLabels";

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
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    quantity: 1,
    category: "",
    shed_id: "",
    zone_id: "",
    quantityOnly: false,
  });
  const [proposedCodes, setProposedCodes] = useState([]);
  const [createdLabels, setCreatedLabels] = useState(null);
  const [createStep, setCreateStep] = useState("form");
  const [createdSub, setCreatedSub] = useState(null);
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [pieceCode, setPieceCode] = useState("");
  const [addedCodes, setAddedCodes] = useState([]);
  const [updateData, setUpdateData] = useState({
    item_id: "",
    quantity: 1,
    action: "add",
    codesText: "",
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
      category: "",
      shed_id: "",
      zone_id: "",
      quantityOnly: false,
    });
    setProposedCodes([]);
    setCreatedLabels(null);
    setCreateStep("form");
    setCreatedSub(null);
    setPrefix("");
    setPrefixTouched(false);
    setPieceCode("");
    setAddedCodes([]);
    setUpdateData({
      item_id: itemId != null ? Number(itemId) : "",
      quantity: 1,
      action: "add",
      codesText: "",
    });
    getCategories()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCategories(list);
        if (list.length > 0) {
          setFormData((prev) => ({
            ...prev,
            category: prev.category || list[0].name,
          }));
        }
      })
      .catch((err) => console.error("Error cargando categorías:", err));

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

  const selectedUpdateItem = isLockedToItem
    ? lockedItem
    : items.find((item) => item.id === updateData.item_id);
  const updateTracksUnits = Boolean(selectedUpdateItem?.track_units);

  useEffect(() => {
    if (!isOpen || mode !== "create" || formData.quantityOnly || prefixTouched || createStep !== "form") {
      return;
    }
    const name = formData.name.trim();
    if (!name) {
      setPrefix("");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestPrefix(name)
        .then((data) => {
          if (!cancelled) setPrefix(data.prefix || "");
        })
        .catch(() => {
          if (!cancelled) setPrefix("");
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, mode, formData.name, formData.quantityOnly, prefixTouched, createStep]);

  useEffect(() => {
    if (!isOpen || mode !== "update" || !updateTracksUnits || updateData.action !== "add") {
      return;
    }
    let cancelled = false;
    getNextCodes(updateData.quantity || 1, selectedUpdateItem?.code_prefix)
      .then((data) => {
        if (!cancelled) {
          setProposedCodes(data.codes || []);
          setUpdateData((prev) => ({ ...prev, codesText: (data.codes || []).join(", ") }));
        }
      })
      .catch(() => {
        if (!cancelled) setProposedCodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, updateTracksUnits, updateData.action, updateData.quantity, selectedUpdateItem?.code_prefix]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "create") {
        if (createStep === "piece") {
          const code = pieceCode.trim();
          if (!createdSub?.id || !code) {
            setError("Falta el código de la pieza");
            setIsLoading(false);
            return;
          }
          const updated = await updateItem(createdSub.id, {
            quantity: 1,
            action: "add",
            codes: [code],
          });
          const saved = updated?.codes?.[0] || code.toUpperCase();
          setAddedCodes((prev) => [...prev, saved]);
          setCreateStep("ask");
          refreshItems?.();
          return;
        }
        if (!formData.name || !formData.category || !formData.shed_id || !formData.zone_id) {
          setError("Nombre, categoría, depósito y zona son obligatorios");
          setIsLoading(false);
          return;
        }
        if (!formData.quantityOnly && !prefix.trim()) {
          setError("El prefijo es una letra, por ejemplo H");
          setIsLoading(false);
          return;
        }
        const created = await createItem({
          name: formData.name,
          description: formData.description,
          quantity: formData.quantityOnly ? formData.quantity : 0,
          category: formData.category,
          shed_id: Number(formData.shed_id),
          zone_id: Number(formData.zone_id),
          track_units: !formData.quantityOnly,
          code_prefix: formData.quantityOnly ? undefined : prefix.trim(),
        });
        refreshItems?.();
        if (formData.quantityOnly) {
          onClose();
          return;
        }
        setCreatedSub(created);
        setCreateStep("ask");
        return;
      } else {
        const { item_id, quantity, action } = updateData;
        if (!item_id || quantity <= 0 || !action) {
          setError("Ítem, cantidad y acción son obligatorios");
          setIsLoading(false);
          return;
        }
        const typedCodes = (updateData.codesText || "")
          .split(/[\s,;]+/)
          .map((code) => code.trim())
          .filter(Boolean);
        const updated = await updateItem(updateData.item_id, {
          quantity: updateData.quantity,
          action: updateData.action,
          ...(updateTracksUnits && typedCodes.length ? { codes: typedCodes } : {}),
        });
        refreshItems?.();
        if (updated?.codes?.length && action === "add") {
          setCreatedLabels({
            name: selectedUpdateItem?.name || "Artículo",
            codes: updated.codes,
            category: selectedUpdateItem?.category || "",
          });
          return;
        }
      }
      onClose();
    } catch (err) {
      setError(err.message || "Error al procesar la operación");
    } finally {
      setIsLoading(false);
    }
  };

  const startPiece = async () => {
    if (!createdSub?.code_prefix) return;
    setError("");
    setIsLoading(true);
    try {
      const data = await getNextCodes(1, createdSub.code_prefix);
      setPieceCode(data.codes?.[0] || "");
      setCreateStep("piece");
    } catch (err) {
      setError(err.message || "No se pudo proponer el código");
    } finally {
      setIsLoading(false);
    }
  };

  const finishCreate = () => {
    if (addedCodes.length) {
      setCreatedLabels({
        name: createdSub?.name || formData.name,
        codes: addedCodes,
        category: createdSub?.category || formData.category,
      });
      return;
    }
    onClose();
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
              {mode === "create"
                ? createStep === "form"
                  ? "Nueva subcategoría"
                  : "Agregar pieza"
                : "Actualizar stock"}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body px-4 py-3">
            {createdLabels ? (
              <div>
                <p>
                  Quedaron {createdLabels.codes.length} código
                  {createdLabels.codes.length === 1 ? "" : "s"} para etiquetar{" "}
                  <strong>{createdLabels.name}</strong>.
                </p>
                <p className="fw-semibold">
                  {createdLabels.codes[0]}
                  {createdLabels.codes.length > 1
                    ? ` a ${createdLabels.codes[createdLabels.codes.length - 1]}`
                    : ""}
                </p>
                <div className="d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => printLabels(createdLabels.name, createdLabels.codes, createdLabels.category)}
                  >
                    Imprimir etiquetas
                  </button>
                  <button type="button" className="btn btn-primary" onClick={onClose}>
                    Listo
                  </button>
                </div>
              </div>
            ) : (
            <>
            {error && <div className="alert alert-danger text-center">{error}</div>}

            {mode === "create" && createStep === "ask" ? (
              <div>
                <p className="mb-2">
                  {addedCodes.length === 0 ? (
                    <>
                      <strong>{createdSub?.name}</strong> quedó en 0 en depósito.
                    </>
                  ) : (
                    <>
                      Se agregó <strong>{addedCodes[addedCodes.length - 1]}</strong>. Hay{" "}
                      {addedCodes.length} en depósito.
                    </>
                  )}
                </p>
                <p>¿Agregar {addedCodes.length === 0 ? "una pieza" : "otra"}?</p>
                <div className="d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-outline-secondary" onClick={finishCreate}>
                    No
                  </button>
                  <button type="button" className="btn btn-primary" onClick={startPiece} disabled={isLoading}>
                    Sí
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleSubmit}>
              {mode === "create" && createStep === "piece" ? (
                <>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Subcategoría:</label>
                    <div className="form-control-plaintext fw-semibold px-0">{createdSub?.name}</div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Categoría:</label>
                    <div className="form-control-plaintext px-0">{createdSub?.category || formData.category}</div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold" htmlFor="piece-code">Código:</label>
                    <input
                      id="piece-code"
                      className="form-control"
                      value={pieceCode}
                      onChange={(e) => setPieceCode(e.target.value.toUpperCase())}
                      required
                    />
                    <div className="form-text">
                      Si la pieza ya viene marcada, cambiala antes de guardar.
                    </div>
                  </div>
                </>
              ) : mode === "create" ? (
                <>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Subcategoría:</label>
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

                  {formData.quantityOnly && (
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
                  )}

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
                        <option key={cat.id || cat.name} value={cat.name}>
                          {cat.label || cat.name}
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

                  <div className="form-check mb-3">
                    <input
                      id="quantity-only"
                      type="checkbox"
                      className="form-check-input"
                      checked={formData.quantityOnly}
                      onChange={(e) =>
                        setFormData({ ...formData, quantityOnly: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="quantity-only">
                      Solo cantidad (sin código por pieza)
                    </label>
                  </div>

                  {!formData.quantityOnly && (
                    <div className="mb-3">
                      <label className="form-label fw-bold" htmlFor="subcategory-prefix">
                        Prefijo
                      </label>
                      <input
                        id="subcategory-prefix"
                        className="form-control"
                        style={{ maxWidth: 140 }}
                        value={prefix}
                        maxLength={4}
                        onChange={(e) => {
                          setPrefixTouched(true);
                          setPrefix(e.target.value.toUpperCase());
                        }}
                        required
                      />
                      <div className="form-text">
                        {prefix ? `La primera pieza va a ser ${prefix}-001.` : "Letra inicial, y más letras si ya está usado."}
                      </div>
                    </div>
                  )}
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
                        setUpdateData({
                          ...updateData,
                          action: e.target.value,
                          codesText: "",
                        })
                      }
                    >
                      <option value="add">Agregar stock</option>
                      <option value="rest">Quitar stock</option>
                    </select>
                  </div>

                  {updateTracksUnits && (
                    <div className="mb-3">
                      <label className="form-label fw-bold">
                        Códigos {updateData.action === "add" ? "de las piezas nuevas" : "(opcional)"}
                      </label>
                      <textarea
                        className="form-control"
                        rows="3"
                        value={updateData.codesText}
                        onChange={(e) =>
                          setUpdateData({ ...updateData, codesText: e.target.value })
                        }
                      />
                      <div className="form-text">
                        {updateData.action === "add"
                          ? "Uno por cada unidad que entra. Podés reemplazar los que propone el sistema."
                          : "Si lo dejás vacío, se dan de baja las piezas más antiguas que están en depósito."}
                      </div>
                    </div>
                  )}
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
                    : mode === "create" && createStep === "piece"
                      ? "Agregar"
                      : mode === "create"
                        ? formData.quantityOnly
                          ? "Crear"
                          : "Crear subcategoría"
                        : "Actualizar stock"}
                </button>
              </div>
            </form>
            )}
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateItemModal;
