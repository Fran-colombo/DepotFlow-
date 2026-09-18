import { useEffect, useMemo, useState } from "react";
import logoConkreto from "../assets/logo-conkreto.png";

const todayInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

const formatDate = (isoDate) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildPrintHtml = ({ meta, rows, logoSrc }) => {
  const itemsHtml = rows
    .map(
      (item, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.description ? `<div class="muted">${escapeHtml(item.description)}</div>` : ""}
        </td>
        <td>${escapeHtml(item.type)}</td>
        <td>${escapeHtml(item.category || "—")}</td>
        <td>${escapeHtml(item.location)}</td>
        <td class="num">${escapeHtml(item.moveAmount)}</td>
        <td class="check"><span class="box"></span></td>
        <td class="check"><span class="box"></span></td>
        <td class="notes"></td>
      </tr>`
    )
    .join("");

  const totalUnits = rows.reduce((sum, item) => sum + Number(item.moveAmount || 0), 0);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Chequeo de mudanza</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2937;
        margin: 24px;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #175cd3;
        padding-bottom: 12px;
        margin-bottom: 16px;
      }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #667085; font-size: 12px; }
      .meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 24px;
        margin-bottom: 16px;
        font-size: 13px;
      }
      table { width: 100%; border-collapse: collapse; }
      th, td {
        border: 1px solid #d0d5dd;
        padding: 6px 8px;
        font-size: 12px;
        vertical-align: middle;
      }
      th {
        background: #f2f4f7;
        text-align: left;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .num { text-align: right; width: 48px; }
      .check { text-align: center; width: 58px; }
      .notes { min-width: 90px; }
      .box {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 1.5px solid #344054;
      }
      .signs {
        display: flex;
        justify-content: space-between;
        gap: 48px;
        margin-top: 36px;
        font-size: 13px;
      }
      .sign { flex: 1; }
      .line { margin-top: 28px; border-top: 1px solid #344054; padding-top: 6px; }
      .totals { margin-top: 10px; font-size: 13px; }
      img { max-height: 48px; }
      @media print {
        body { margin: 10mm; }
        .no-print { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom:16px">
      <button onclick="window.print()">Imprimir / Guardar PDF</button>
    </div>
    <header>
      <div>
        <h1>Chequeo de mudanza</h1>
        <div class="muted">Conkreto Construcciones — control de salida y llegada</div>
      </div>
      ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Conkreto" />` : ""}
    </header>
    <div class="meta">
      <div><strong>Fecha:</strong> ${escapeHtml(formatDate(meta.date))}</div>
      <div><strong>Responsable:</strong> ${escapeHtml(meta.responsible || "—")}</div>
      <div><strong>Origen:</strong> ${escapeHtml(meta.origin || "—")}</div>
      <div><strong>Destino:</strong> ${escapeHtml(meta.destination || "—")}</div>
      ${meta.notes ? `<div style="grid-column:1/-1"><strong>Notas:</strong> ${escapeHtml(meta.notes)}</div>` : ""}
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Producto</th>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Ubicación origen</th>
          <th>Cant.</th>
          <th>Salió</th>
          <th>Llegó</th>
          <th>Obs.</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p class="totals">
      <strong>${rows.length}</strong> ítem${rows.length === 1 ? "" : "s"} ·
      <strong>${totalUnits}</strong> unidad${totalUnits === 1 ? "" : "es"}
    </p>
    <div class="signs">
      <div class="sign">
        <div class="line">Firma y aclaración — origen / salida</div>
      </div>
      <div class="sign">
        <div class="line">Firma y aclaración — destino / llegada</div>
      </div>
    </div>
  </body>
</html>`;
};

const downloadCsv = (meta, rows) => {
  const header = [
    "Fecha",
    "Responsable",
    "Origen",
    "Destino",
    "Producto",
    "Tipo",
    "Categoria",
    "Ubicacion",
    "Cantidad",
    "Salio",
    "Llego",
    "Observaciones",
  ];
  const lines = rows.map((item) =>
    [
      formatDate(meta.date),
      meta.responsible,
      meta.origin,
      meta.destination,
      item.name,
      item.type,
      item.category,
      item.location,
      item.moveAmount,
      "",
      "",
      meta.notes,
    ]
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = `\uFEFF${header.join(",")}\n${lines.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = (meta.date || todayInputValue()).replaceAll("-", "");
  link.href = url;
  link.download = `chequeo-mudanza-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function MoveChecklistModal({ isOpen, items, defaultOrigin = "", onClose }) {
  const [meta, setMeta] = useState({
    date: todayInputValue(),
    origin: defaultOrigin,
    destination: "",
    responsible: "",
    notes: "",
  });
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setMeta({
      date: todayInputValue(),
      origin: defaultOrigin,
      destination: "",
      responsible: "",
      notes: "",
    });
    setRows(
      items.map((item) => ({
        ...item,
        moveAmount: item.actualAmount ?? 0,
      }))
    );
  }, [isOpen, defaultOrigin, items]);

  const totalUnits = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.moveAmount || 0), 0),
    [rows]
  );

  if (!isOpen) return null;

  const updateMeta = (event) => {
    const { name, value } = event.target;
    setMeta((prev) => ({ ...prev, [name]: value }));
  };

  const updateAmount = (id, value) => {
    setRows((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, moveAmount: value === "" ? "" : Math.max(0, Number(value)) } : item
      )
    );
  };

  const handlePrint = () => {
    const html = buildPrintHtml({
      meta,
      rows,
      logoSrc: `${window.location.origin}${logoConkreto}`,
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, "_blank");
    if (!printWindow) {
      URL.revokeObjectURL(url);
      alert("El navegador bloqueó la ventana de impresión. Permití pop-ups e intentá de nuevo.");
      return;
    }
    printWindow.addEventListener("load", () => {
      printWindow.focus();
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content border-0 shadow">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-0">Chequeo de mudanza</h5>
              <div className="app-muted">
                Imprimí o descargá la lista para marcar qué salió y qué llegó.
              </div>
            </div>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <label className="form-label small text-secondary mb-1">Fecha</label>
                <input
                  type="date"
                  name="date"
                  value={meta.date}
                  onChange={updateMeta}
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-md-8">
                <label className="form-label small text-secondary mb-1">Responsable</label>
                <input
                  type="text"
                  name="responsible"
                  value={meta.responsible}
                  onChange={updateMeta}
                  className="form-control form-control-sm"
                  placeholder="Quién carga / recibe"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small text-secondary mb-1">Origen</label>
                <input
                  type="text"
                  name="origin"
                  value={meta.origin}
                  onChange={updateMeta}
                  className="form-control form-control-sm"
                  placeholder="Galpón / zona de salida"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small text-secondary mb-1">Destino</label>
                <input
                  type="text"
                  name="destination"
                  value={meta.destination}
                  onChange={updateMeta}
                  className="form-control form-control-sm"
                  placeholder="Galpón / obra de llegada"
                />
              </div>
              <div className="col-12">
                <label className="form-label small text-secondary mb-1">Notas</label>
                <input
                  type="text"
                  name="notes"
                  value={meta.notes}
                  onChange={updateMeta}
                  className="form-control form-control-sm"
                  placeholder="Camión, turno, observaciones..."
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="table app-table mb-0">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Ubicación</th>
                    <th className="text-end">Cant. a mudar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-semibold">{item.name}</div>
                        <div className="app-muted">{item.category}</div>
                      </td>
                      <td>{item.type}</td>
                      <td>{item.location}</td>
                      <td className="text-end" style={{ width: 120 }}>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-sm text-end"
                          value={item.moveAmount}
                          onChange={(e) => updateAmount(item.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="app-muted mt-3 mb-0">
              {rows.length} ítem{rows.length === 1 ? "" : "s"} · {totalUnits} unidad
              {totalUnits === 1 ? "" : "es"}
            </p>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => downloadCsv(meta, rows)}
              disabled={rows.length === 0}
            >
              Descargar CSV
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              disabled={rows.length === 0}
            >
              Imprimir chequeo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
