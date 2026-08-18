#!/usr/bin/env bash
# Reset DEMO database to fictional baseline. Safe for demo only — never run against production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.demo.yml -p depotflow-demo"
DB_FILE="demo/shed_data_demo/shed.db"

echo "==> Stopping demo stack..."
$COMPOSE down

if [[ -f "$DB_FILE" ]]; then
  echo "==> Removing demo database: $DB_FILE"
  rm -f "$DB_FILE"
fi

echo "==> Starting demo stack (seed runs on backend start)..."
export DEMO_RESET=1
$COMPOSE up -d --build

echo "==> Demo reset complete."
echo "    Web: http://localhost:8080"
echo "    API: http://localhost:8001/docs"
