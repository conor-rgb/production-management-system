#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/srv/production-management-system"

cd "$ROOT_DIR"

echo "==> Backend"
cd "$ROOT_DIR/backend"
npm install
npm run build

# If a process manager is in use, replace this block.
if pgrep -f "node dist/index.js" >/dev/null 2>&1; then
  echo "Backend already running on 3000. Skipping start."
else
  npm run start &
fi


echo "==> Frontend"
cd "$ROOT_DIR/frontend"
npm install
npm run build
sudo rsync -a --delete dist/ /var/www/agent/
sudo systemctl reload nginx

echo "Build complete. Nginx reloaded and /var/www/agent updated."
