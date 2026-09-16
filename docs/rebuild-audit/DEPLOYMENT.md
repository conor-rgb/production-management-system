# Deployment reference

Current runbook: [../deploy.md](../deploy.md). Current outcomes: [release records](../releases/README.md). The [July audit](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/DEPLOYMENT.md) is preserved as historical evidence.

Verified deployment: PM2 `production-management-api` (ID 0), script `/srv/production-management-system/backend/dist/index.js`, working directory `backend`; nginx serves `/var/www/agent` for `agent.unlimited.bond` and proxies API requests to 127.0.0.1:3000. PostgreSQL 16 is local; sessions are in `pms_sessions`.

At 16 September preflight, 71 migrations were applied and only `20260916130000_project_drive_storage` was pending. Do not generalise that result to future releases: check status every time. The release record records actual application and health results.

A July cron audit found a reference to a missing backup script. That is not evidence of working scheduled backups today. The current release creates an explicit protected backup and does not claim to repair or certify that older schedule.
