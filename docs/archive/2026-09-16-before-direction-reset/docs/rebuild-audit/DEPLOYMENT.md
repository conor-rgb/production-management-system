# Deployment

## PM2

- Process: `production-management-api`.
- Status during audit: online, 0 restarts, uptime around 5 hours.
- Script path: `/srv/production-management-system/backend/dist/index.js`.
- CWD: `/srv/production-management-system/backend`.
- Node version: `20.19.6`.
- systemd unit: `pm2-root.service` active.

## nginx

- Active service: `nginx`.
- Domain: `agent.unlimited.bond`.
- TLS cert paths under `/etc/letsencrypt/live/agent.unlimited.bond/`.
- Static root: `/var/www/agent`.
- `/api/` proxies to `http://127.0.0.1:3000`.
- `/socket.io/` proxies to `http://127.0.0.1:3000` with upgrade headers.
- `/uploads` aliases `/var/www/agent/uploads`; current app storage primarily uses `backend/storage`.

## PostgreSQL

- Services active: `postgresql.service`, `postgresql@16-main.service`.
- Prisma datasource provider: PostgreSQL.
- Session table: `pms_sessions`.

## Cron

- Root crontab contains: `30 3 * * * /srv/production-management-system/scripts/backup_db.sh >/srv/production-management-system/backups/backup.log 2>&1`.
- `scripts/backup_db.sh` was not found in the current working tree; treat this as stale or external until clarified.

## Docker

- No Docker deployment files were found in the repository root scan.

## Health

- `GET http://127.0.0.1:3000/api/health` returned 200.
- `GET http://127.0.0.1/` returned 200 from nginx/frontend.
