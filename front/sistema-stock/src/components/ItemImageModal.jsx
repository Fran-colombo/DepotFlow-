import { useEffect, useRef, useState } from "react";
import { deleteItemImage, getItemImageUrl, uploadItemImage } from "../api/items";

const ItemImageModal = ({ item, isOpen, mode = "upload", onClose, onSuccess }) => {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const hasImage = Boolean(item?.has_image);
  const existingUrl = getItemImageUrl(item);
  const isView = mode === "view";

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setPreviewUrl(null);
    setIsSaving(false);
    setIsDeleting(false);
    setError("");
  }, [isOpen, item?.id, mode]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen || !item) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    e.target.value = "";
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setError("Elegí una imagen (JPG, PNG, WEBP, foto del celular, etc.)");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setError("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Elegí una foto o un archivo de imagen");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await uploadItemImage(item.id, file);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Error al guardar la imagen");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!hasImage) return;
    if (!window.confirm(`¿Eliminar la imagen de "${item.name}"?`)) return;
    setIsDeleting(true);
    setError("");
    try {
      await deleteItemImage(item.id);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Error al eliminar la imagen");
    } finally {
      setIsDeleting(false);
    }
  };

  const title = isView
    ? item.name
    : hasImage
      ? "Actualizar imagen"
      : "Cargar imagen";

  const displaySrc = previewUrl || (hasImage ? existingUrl : null);

  return (
    <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(16,24,40,0.45)" }}>
      <div className={`modal-dialog modal-dialog-centered ${isView ? "modal-lg" : ""}`}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={isSaving || isDeleting} />
          </div>
          <form onSubmit={handleSave}>
            <div className="modal-body">
              {error && <div className="alert alert-danger py-2">{error}</div>}

              <div className="item-image-preview mb-3">
                {displaySrc ? (
                  <img src={displaySrc} alt={item.name} />
                ) : (
                  <div className="item-image-empty">
                    <i className="bi bi-image fs-1 d-block mb-2"></i>
                    Todavía no hay foto de este producto
                  </div>
                )}
              </div>

              {!isView && (
                <>
                  <p className="app-muted mb-2">
                    Podés sacar una foto con el celular o elegir un archivo (PNG, JPG, WEBP, etc.).
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <i className="bi bi-camera me-1"></i>
                      Sacar foto
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSaving}
                    >
                      <i className="bi bi-folder2-open me-1"></i>
                      Elegir archivo
                    </button>
                  </div>
                  {file && (
                    <div className="app-muted mt-2">{file.name}</div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="d-none"
                    onChange={handleFileChange}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="d-none"
                    onChange={handleFileChange}
                  />
                </>
              )}
            </div>
            <div className="modal-footer">
              {hasImage && (
                <button
                  type="button"
                  className="btn btn-outline-danger me-auto"
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                >
                  {isDeleting ? "Eliminando..." : "Eliminar imagen"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                Cerrar
              </button>
              {!isView && (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving || isDeleting || !file}
                >
                  {isSaving ? "Guardando..." : hasImage ? "Actualizar imagen" : "Cargar imagen"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ItemImageModal;
