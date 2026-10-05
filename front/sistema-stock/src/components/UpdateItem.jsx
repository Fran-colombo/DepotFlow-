import { useEffect, useState } from "react";
import { addPiece, createItem, updateItem, getItems, getItemById, getItemUnits, getNextCodes, suggestPrefix } from "../api/items";
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
    innerQuantity: false,
  });
  const [createdLabels, setCreatedLabels] = useState(null);
  const [createStep, setCreateStep] = useState("form");
  const [createdSub, setCreatedSub] = useState(null);
  const [prefix, setPrefix] = useState("");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [pieceCode, setPieceCode] = useState("");
  const [pieceName, setPieceName] = useState("");
  const [pieceNote, setPieceNote] = useState("");
  const [pieceBroken, setPieceBroken] = useState(false);
  const [pieceDamage, setPieceDamage] = useState("");
  const [pieceRepair, setPieceRepair] = useState("");
  const [pieceContent, setPieceContent] = useState("");
  const [addedCodes, setAddedCodes] = useState([]);
  const [updateData, setUpdateData] = useState({
    item_id: "",
    quantity: 1,
    action: "add",
    codesText: "",
  });
  const [newPieces, setNewPieces] = useState([]);
  const [existingPieces, setExistingPieces] = useState([]);
  const [savedNames, setSavedNames] = useState({});
  const [savedQuantities, setSavedQuantities] = useState({});

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
      innerQuantity: false,
    });
    setCreatedLabels(null);
    setCreateStep("form");
    setCreatedSub(null);
    setPrefix("");
    setPrefixTouched(false);
    setPieceCode("");
    setPieceName("");
    setPieceNote("");
    setPieceBroken(false);
    setPieceDamage("");
    setPieceRepair("");
    setPieceContent("");
    setAddedCodes([]);
    setUpdateData({
      item_id: itemId != null ? Number(itemId) : "",
      quantity: 1,
      action: "add",
      codesText: "",
    });
    setNewPieces([]);
    setExistingPieces([]);
    setSavedNames({});
    setSavedQuantities({});
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
  const updateInner = Boolean(selectedUpdateItem?.inner_quantity);

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
    if (!isOpen || mode !== "update" || !updateTracksUnits || (!updateInner && updateData.action !== "add")) {
      return;
    }
    let cancelled = false;
    const count = updateInner ? 1 : updateData.quantity || 1;
    getNextCodes(count, selectedUpdateItem?.code_prefix)
      .then((data) => {
        if (!cancelled) {
          const codes = data.codes || [];
          setNewPieces((prev) =>
            codes.map((code, index) => ({
              code,
              name: prev.find((piece) => piece.code === code)?.name || prev[index]?.name || "",
              quantity: prev.find((piece) => piece.code === code)?.quantity || prev[index]?.quantity || "",
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setNewPieces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, updateTracksUnits, updateInner, updateData.action, updateData.quantity, selectedUpdateItem?.code_prefix]);

  useEffect(() => {
    if (!isOpen || mode !== "update" || !updateTracksUnits || !selectedUpdateItem?.id) {
      setExistingPieces([]);
      setSavedNames({});
      setSavedQuantities({});
      return;
    }
    let cancelled = false;
    getItemUnits(selectedUpdateItem.id, "all")
      .then((data) => {
        if (cancelled) return;
        const units = Array.isArray(data?.units) ? data.units : [];
        const list = units.map((unit) => ({
          id: unit.id,
          code: unit.code,
          name: unit.name || "",
          status: unit.status || "",
          status_label: unit.status_label || "",
          quantity: unit.quantity ?? 1,
        }));
        setExistingPieces(list);
        setSavedNames(Object.fromEntries(list.map((unit) => [unit.id, unit.name])));
        setSavedQuantities(Object.fromEntries(list.map((unit) => [unit.id, unit.quantity])));
      })
      .catch(() => {
        if (!cancelled) {
          setExistingPieces([]);
          setSavedNames({});
          setSavedQuantities({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, updateTracksUnits, selectedUpdateItem?.id]);

  const changedNames = () => {
    const renames = [];
    for (const piece of existingPieces) {
      const next = (piece.name || "").trim();
      const previous = savedNames[piece.id] || "";
      if (next === previous) continue;
      if (!next) {
        setError("El nombre de la pieza es obligatorio");
        return null;
      }
      renames.push({ id: piece.id, name: next });
    }
    return renames;
  };

  const saveNames = async () => {
    if (!selectedUpdateItem?.id) return;
    setError("");
    const renames = changedNames();
    if (renames === null) return;
    if (!renames.length) {
      setError("No hay nombres para guardar");
      return;
    }
    setIsLoading(true);
    try {
      await updateItem(selectedUpdateItem.id, {
        quantity: 0,
        action: "add",
        renames,
      });
      setSavedNames((prev) => {
        const next = { ...prev };
        renames.forEach((row) => {
          next[row.id] = row.name;
        });
        return next;
      });
      refreshItems?.();
    } catch (err) {
      setError(err.message || "No se pudieron guardar los nombres");
    } finally {
      setIsLoading(false);
    }
  };

  const saveContents = async () => {
    if (!selectedUpdateItem?.id) return;
    setError("");
    const contents = [];
    for (const piece of existingPieces) {
      if (piece.status === "consumida") continue;
      const next = parseInt(piece.quantity, 10);
      if (Number.isNaN(next) || next < 0) {
        setError("La cantidad no puede ser negativa");
        return;
      }
      if (next === savedQuantities[piece.id]) continue;
      contents.push({ id: piece.id, quantity: next });
    }
    if (!contents.length) {
      setError("No hay cantidades para guardar");
      return;
    }
    setIsLoading(true);
    try {
      await updateItem(selectedUpdateItem.id, {
        quantity: 0,
        action: "add",
        contents,
      });
      setSavedQuantities((prev) => {
        const next = { ...prev };
        contents.forEach((row) => {
          next[row.id] = row.quantity;
        });
        return next;
      });
      refreshItems?.();
    } catch (err) {
      setError(err.message || "No se pudieron guardar las cantidades");
    } finally {
      setIsLoading(false);
    }
  };

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
          if (!pieceName.trim()) {
            setError("El nombre de la pieza es obligatorio");
            setIsLoading(false);
            return;
          }
          const inside = parseInt(pieceContent, 10);
          if (createdSub?.inner_quantity && (!inside || inside < 1)) {
            setError("Indicá cuántos hay adentro");
            setIsLoading(false);
            return;
          }
          const updated = await addPiece(createdSub.id, {
            code,
            name: pieceName.trim(),
            observation: pieceNote.trim(),
            is_broken: pieceBroken,
            damage_note: pieceBroken ? pieceDamage.trim() : "",
            repair_note: pieceBroken ? pieceRepair.trim() : "",
            ...(createdSub?.inner_quantity ? { quantity: inside } : {}),
          });
          const saved = updated?.code || code.toUpperCase();
          setAddedCodes((prev) => [...prev, saved]);
          setPieceName("");
          setPieceNote("");
          setPieceBroken(false);
          setPieceDamage("");
          setPieceRepair("");
          setPieceContent("");
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
          inner_quantity: !formData.quantityOnly && Boolean(formData.innerQuantity),
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
        if (updateInner) {
          const box = newPieces[0];
          const inside = parseInt(box?.quantity, 10);
          if (!box?.code?.trim() || !box?.name?.trim() || !inside || inside < 1) {
            setError("La caja nueva necesita código, nombre y cuántos hay adentro");
            setIsLoading(false);
            return;
          }
          const renames = changedNames();
          if (renames === null) {
            setIsLoading(false);
            return;
          }
          const updated = await updateItem(updateData.item_id, {
            quantity: 1,
            action: "add",
            piece_names: [{
              code: box.code.trim(),
              name: box.name.trim(),
              quantity: inside,
            }],
            ...(renames.length ? { renames } : {}),
          });
          refreshItems?.();
          setCreatedLabels({
            name: selectedUpdateItem?.name || "Artículo",
            codes: updated?.codes?.length ? updated.codes : [box.code.trim()],
            category: selectedUpdateItem?.category || "",
          });
          return;
        }
        const { item_id, quantity, action } = updateData;
        if (!item_id || quantity <= 0 || !action) {
          setError("Ítem, cantidad y acción son obligatorios");
          setIsLoading(false);
          return;
        }
        const renames = changedNames();
        if (renames === null) {
          setIsLoading(false);
          return;
        }
        if (updateTracksUnits && action === "add") {
          if (newPieces.length !== quantity || newPieces.some((piece) => !piece.name.trim() || !piece.code.trim())) {
            setError("Cada pieza nueva necesita un código y un nombre");
            setIsLoading(false);
            return;
          }
          const updated = await updateItem(updateData.item_id, {
            quantity,
            action,
            piece_names: newPieces.map((piece) => ({
              code: piece.code.trim(),
              name: piece.name.trim(),
            })),
            ...(renames.length ? { renames } : {}),
          });
          refreshItems?.();
          setCreatedLabels({
            name: selectedUpdateItem?.name || "Artículo",
            codes: updated?.codes?.length ? updated.codes : newPieces.map((piece) => piece.code.trim()),
            category: selectedUpdateItem?.category || "",
          });
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
          ...(renames.length ? { renames } : {}),
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
      setPieceName("");
      setPieceNote("");
      setPieceBroken(false);
      setPieceDamage("");
      setPieceRepair("");
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
                  <div className="mb-3">
                    <label className="form-label fw-bold" htmlFor="piece-name">Nombre de la pieza:</label>
                    <input
                      id="piece-name"
                      className="form-control"
                      value={pieceName}
                      onChange={(e) => setPieceName(e.target.value)}
                      placeholder="Amoladora chica Makita verde"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold" htmlFor="piece-note">Observación:</label>
                    <textarea
                      id="piece-note"
                      className="form-control"
                      rows="2"
                      value={pieceNote}
                      onChange={(e) => setPieceNote(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="form-check mb-3">
                    <input
                      id="piece-broken"
                      type="checkbox"
                      className="form-check-input"
                      checked={pieceBroken}
                      onChange={(e) => setPieceBroken(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="piece-broken">Rota</label>
                  </div>
                  {createdSub?.inner_quantity && (
                    <div className="mb-3">
                      <label className="form-label fw-bold" htmlFor="piece-inside">Cuántos hay adentro:</label>
                      <input
                        id="piece-inside"
                        type="number"
                        min="1"
                        className="form-control"
                        value={pieceContent}
                        onChange={(e) => setPieceContent(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  {pieceBroken && (
                    <>
                      <div className="mb-3">
                        <label className="form-label fw-bold" htmlFor="piece-damage">Qué le pasó:</label>
                        <textarea
                          id="piece-damage"
                          className="form-control"
                          rows="2"
                          value={pieceDamage}
                          onChange={(e) => setPieceDamage(e.target.value)}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label fw-bold" htmlFor="piece-repair">Qué habría que hacer:</label>
                        <textarea
                          id="piece-repair"
                          className="form-control"
                          rows="2"
                          value={pieceRepair}
                          onChange={(e) => setPieceRepair(e.target.value)}
                        />
                      </div>
                    </>
                  )}
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
                        setFormData({
                          ...formData,
                          quantityOnly: e.target.checked,
                          innerQuantity: e.target.checked ? false : formData.innerQuantity,
                        })
                      }
                    />
                    <label className="form-check-label" htmlFor="quantity-only">
                      Solo cantidad (sin código por pieza)
                    </label>
                  </div>

                  <div className="form-check mb-3">
                    <input
                      id="inner-quantity"
                      type="checkbox"
                      className="form-check-input"
                      checked={Boolean(formData.innerQuantity) && !formData.quantityOnly}
                      disabled={formData.quantityOnly}
                      onChange={(e) =>
                        setFormData({ ...formData, innerQuantity: e.target.checked })
                      }
                    />
                    <label className="form-check-label" htmlFor="inner-quantity">
                      Cantidad dentro del código
                    </label>
                    <div className="form-text">
                      Un código guarda cuántos hay adentro, por ejemplo una caja de 100 o un juego de 4.
                    </div>
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

                  {updateInner ? (
                    <>
                      {existingPieces.length > 0 && (
                        <div className="mb-3">
                          <label className="form-label fw-bold">Códigos que ya existen</label>
                          {existingPieces.map((piece) => (
                            <div className="row g-2 align-items-center mb-2" key={piece.id}>
                              <div className="col-4">
                                <div className="fw-semibold">{piece.code}</div>
                                <div className="small text-muted">{piece.status_label}</div>
                              </div>
                              <div className="col-5">
                                <input
                                  className="form-control"
                                  placeholder="Nombre"
                                  value={piece.name}
                                  onChange={(e) =>
                                    setExistingPieces((prev) =>
                                      prev.map((row) =>
                                        row.id === piece.id ? { ...row, name: e.target.value } : row
                                      )
                                    )
                                  }
                                />
                              </div>
                              <div className="col-3">
                                <input
                                  type="number"
                                  min="0"
                                  className="form-control"
                                  aria-label={`Cantidad de ${piece.code}`}
                                  value={piece.quantity}
                                  disabled={piece.status === "consumida"}
                                  onChange={(e) =>
                                    setExistingPieces((prev) =>
                                      prev.map((row) =>
                                        row.id === piece.id ? { ...row, quantity: e.target.value } : row
                                      )
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ))}
                          <div className="form-text mb-2">
                            La cantidad es lo que queda en depósito de ese código. Cambiarla no crea otro código.
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={saveNames}
                              disabled={isLoading}
                            >
                              Guardar nombres
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={saveContents}
                              disabled={isLoading}
                            >
                              Guardar cantidades
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        <label className="form-label fw-bold">Otra caja</label>
                        <div className="row g-2 mb-2">
                          <div className="col-4">
                            <input
                              className="form-control"
                              aria-label="Código"
                              value={newPieces[0]?.code || ""}
                              onChange={(e) =>
                                setNewPieces((prev) => {
                                  const current = prev[0] || { code: "", name: "", quantity: "" };
                                  return [{ ...current, code: e.target.value }];
                                })
                              }
                            />
                          </div>
                          <div className="col-8">
                            <input
                              className="form-control"
                              placeholder="Nombre"
                              value={newPieces[0]?.name || ""}
                              onChange={(e) =>
                                setNewPieces((prev) => {
                                  const current = prev[0] || { code: "", name: "", quantity: "" };
                                  return [{ ...current, name: e.target.value }];
                                })
                              }
                            />
                          </div>
                        </div>
                        <label className="form-label">Cuántos hay adentro</label>
                        <input
                          type="number"
                          min="1"
                          className="form-control"
                          value={newPieces[0]?.quantity || ""}
                          onChange={(e) =>
                            setNewPieces((prev) => {
                              const current = prev[0] || { code: "", name: "", quantity: "" };
                              return [{ ...current, quantity: e.target.value }];
                            })
                          }
                        />
                      </div>
                    </>
                  ) : (
                  <>
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

                  {updateTracksUnits && updateData.action === "add" && (
                    <div className="mb-3">
                      <label className="form-label fw-bold">Piezas nuevas</label>
                      {newPieces.map((piece, index) => (
                        <div className="row g-2 mb-2" key={`${piece.code}-${index}`}>
                          <div className="col-4">
                            <input
                              className="form-control"
                              value={piece.code}
                              aria-label="Código"
                              onChange={(e) =>
                                setNewPieces((prev) =>
                                  prev.map((row, rowIndex) =>
                                    rowIndex === index ? { ...row, code: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="col-8">
                            <input
                              className="form-control"
                              placeholder="Nombre de la pieza"
                              value={piece.name}
                              required
                              onChange={(e) =>
                                setNewPieces((prev) =>
                                  prev.map((row, rowIndex) =>
                                    rowIndex === index ? { ...row, name: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <div className="form-text">
                        El código se propone solo. El nombre es obligatorio.
                      </div>
                    </div>
                  )}

                  {updateTracksUnits && updateData.action === "rest" && (
                    <div className="mb-3">
                      <label className="form-label fw-bold">Códigos (opcional)</label>
                      <textarea
                        className="form-control"
                        rows="3"
                        value={updateData.codesText}
                        onChange={(e) =>
                          setUpdateData({ ...updateData, codesText: e.target.value })
                        }
                      />
                      <div className="form-text">
                        Si lo dejás vacío, se dan de baja las piezas más antiguas que están en depósito.
                      </div>
                    </div>
                  )}

                  {updateTracksUnits && existingPieces.length > 0 && (
                    <div className="mb-3">
                      <label className="form-label fw-bold">Piezas que ya existen</label>
                      {existingPieces.map((piece) => (
                        <div className="row g-2 align-items-center mb-2" key={piece.id}>
                          <div className="col-5">
                            <div className="fw-semibold">{piece.code}</div>
                            <div className="small text-muted">{piece.status_label}</div>
                          </div>
                          <div className="col-7">
                            <input
                              className="form-control"
                              placeholder="Nombre de la pieza"
                              value={piece.name}
                              onChange={(e) =>
                                setExistingPieces((prev) =>
                                  prev.map((row) =>
                                    row.id === piece.id ? { ...row, name: e.target.value } : row
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={saveNames}
                        disabled={isLoading}
                      >
                        Guardar nombres
                      </button>
                    </div>
                  )}
                  </>
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
                        : updateInner
                          ? "Agregar caja"
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
