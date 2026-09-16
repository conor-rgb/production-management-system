# Current architecture

Updated 16 September 2026. [Original July audit](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/ARCHITECTURE.md); [current plan](../production-hub/PLAN.md).

React/TypeScript/Vite builds static assets served by nginx at `/var/www/agent`. Express/TypeScript runs under PM2 `production-management-api` from `backend/dist/index.js`; nginx proxies `/api/` to port 3000. Prisma/PostgreSQL owns operational records and the session store (`pms_sessions`). Current authentication is single-team session login.

PostgreSQL owns project/people/action/booking/financial relationships. Drive is the destination for published project documents. Existing local storage remains staging/recovery and supports workflows not yet migrated. There is no new Supabase, S3, Redis or JWT architecture in this release.

Lists use `/api/productions/summary`; detailed modules load separately. Project thread summaries no longer carry full messages. Existing large budget and workbook paths still need consolidation; do not treat the payload fix as a completed architecture rewrite.

The backend entry point runs the Drive queue every 15 seconds, alongside existing Gmail/IMAP and Calendar sync. Drive states persist in JobFile; a database lease and per-project advisory lock protect processing; reserved remote IDs support retries. Published preview/download routes stream from Drive. Full Google consent remains an external activation step.

Read-only audit constraints from July applied to that audit, not to the user's explicitly authorised current deployment. Use reviewed additive migrations and the deployment runbook; never infer permission to delete data or enable resync cleanup.
