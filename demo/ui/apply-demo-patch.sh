#!/bin/sh
set -eu

DASHBOARD="src/pages/Dashboard.jsx"
APP="src/App.jsx"

if ! grep -q "DemoBanner" "$DASHBOARD"; then
  sed -i '/import logoConkreto/a import DemoBanner from "../components/DemoBanner.jsx";' "$DASHBOARD"
  sed -i 's|<div className="min-vh-100 app-shell">|<div className="min-vh-100 app-shell">\n      <DemoBanner />|' "$DASHBOARD"
  echo "DemoBanner injected into Dashboard.jsx (build copy only)."
else
  echo "DemoBanner already present in build copy."
fi

if ! grep -q "DemoLogin" "$APP"; then
  sed -i 's|import Login from "./pages/Login"|import Login from "./components/DemoLogin"|' "$APP"
  echo "DemoLogin wired into App.jsx (build copy only)."
else
  echo "DemoLogin already present in build copy."
fi
