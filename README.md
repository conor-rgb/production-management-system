# Production Management System

A full-service production management platform for unlimited.bond.

## Quick Start (Server)

### Backend
```
cd /srv/production-management-system/backend
npm install
npm run build
npm run start
```

Health check:
```
curl http://localhost:3000/api/health
```

### Frontend
```
cd /srv/production-management-system/frontend
npm install
npm run build
```

Serve `frontend/dist` via your web server (Nginx/PM2/static hosting).

## Environment Variables

Backend expects (see `backend/.env` on server):
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `FRONTEND_URL`
- `SENDGRID_API_KEY`
- `FROM_EMAIL`
- `FREEAGENT_CLIENT_ID`
- `FREEAGENT_CLIENT_SECRET`
- `FREEAGENT_REDIRECT_URI`
- `FREEAGENT_SANDBOX`

Frontend expects:
- `VITE_API_URL` (defaults to `/api`)

## FreeAgent

OAuth and manual contact sync are implemented.
- Connect from the Dashboard
- Use “Sync contacts” to pull clients/suppliers

## Notes

- `backend/prisma/migrations` is tracked in git.
- `.env` files are ignored by default.
