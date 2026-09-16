# Deployment Notes

## Overview

This server runs:
- Backend API on port 3000
- Frontend built assets served by Nginx at `/var/www/agent`

## Update + Redeploy (Manual)

### Backend
```
cd /srv/production-management-system/backend
npm install
npm run build
npm run start
```

### Frontend
```
cd /srv/production-management-system/frontend
npm install
npm run build
sudo rsync -a --delete dist/ /var/www/agent/
sudo systemctl reload nginx
```

Nginx site: `/etc/nginx/sites-available/agent.unlimited.bond`

## Recommended: Basic Deploy Script

From repo root:
```
./scripts/deploy.sh
```

## Notes

- Ensure `.env` exists on server and is not committed.
- For FreeAgent, set OAuth redirect to your public app URL.
