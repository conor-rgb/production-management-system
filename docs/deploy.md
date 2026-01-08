# Deployment Notes

## Overview

This server runs:
- Backend API on port 3000
- Frontend built assets in `frontend/dist` (serve via web server)

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
```

Serve `frontend/dist` with Nginx/PM2/static hosting.

## Recommended: Basic Deploy Script

From repo root:
```
./scripts/deploy.sh
```

## Notes

- Ensure `.env` exists on server and is not committed.
- For FreeAgent, set OAuth redirect to your public app URL.
