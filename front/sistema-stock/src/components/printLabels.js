function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printLabels(itemName, codes, category = "") {
  const list = (codes || []).filter(Boolean);
  if (!list.length) return;

  const cards = list
    .map(
      (code) => `
        <div class="card">
          <div class="category">${escapeHtml(category)}</div>
          <div class="code">${escapeHtml(code)}</div>
          <div class="name">${escapeHtml(itemName)}</div>
        </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas ${escapeHtml(itemName)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; }
    .grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .card { border: 1px solid #222; border-radius: 8px; padding: 16px 12px; width: 200px; text-align: center; break-inside: avoid; }
    .category { font-size: 12px; color: #444; text-transform: uppercase; letter-spacing: 0.4px; }
    .code { font-size: 32px; font-weight: 700; letter-spacing: 0.5px; margin-top: 8px; }
    .name { margin-top: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    window.alert("El navegador bloqueó la ventana de etiquetas.");
    return;
  }
  const printWhenReady = () => {
    win.focus();
    win.print();
  };
  win.addEventListener("load", printWhenReady);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
