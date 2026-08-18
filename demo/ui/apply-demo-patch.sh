#!/bin/sh
set -eu

FILE="src/pages/Dashboard.jsx"

if ! grep -q "DemoBanner" "$FILE"; then
  sed -i '/import logoConkreto/a import DemoBanner from "../components/DemoBanner.jsx";' "$FILE"
  sed -i 's|<div className="min-vh-100 app-shell">|<div className="min-vh-100 app-shell">\n      <DemoBanner />|' "$FILE"
  echo "DemoBanner injected into Dashboard.jsx (build copy only)."
else
  echo "DemoBanner already present in build copy."
fi
