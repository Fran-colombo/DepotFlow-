function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printLabels(itemName, codes) {
  const list = (codes || []).filter(Boolean);
  if (!list.length) return;

  const cards = list
    .map(
      (code) => `
        <div class="card">
          <div class="code">${escapeHtml(code)}</div>
          <div class="name">${escapeHtml(itemName)}</div>
        </div>`
    )
    .join("");

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    window.alert("El navegador bloqueó la ventana de etiquetas.");
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas ${escapeHtml(itemName)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .card { border: 1px solid #222; border-radius: 8px; padding: 16px 12px; width: 180px; text-align: center; break-inside: avoid; }
    .code { font-size: 28px; font-weight: 700; letter-spacing: 0.5px; }
    .name { margin-top: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}
