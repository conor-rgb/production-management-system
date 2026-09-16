# 16 September 2026 — supplier purchase orders in the live register

Status: deployed and live-verified at 2026-09-16T14:25:17.105Z. Authorisation: the user said “continue” after the new-project release and previously authorised ongoing rework/deployment.

Scope: [supplier PO workflow](../production-hub/PURCHASE-ORDER-WORKFLOW.md). Draft/review/issue, frozen supplier agreements, shared legacy/new numbering, live-cost commitments, durable branded PDFs filed to Drive, invoice matching and reconciliation exceptions. No emails are sent by issue or cancellation. Approved estimates and legacy records are preserved.

Release steps completed; evidence below.

## Deployment evidence

- Release `20260916T142121Z`, final publication 2026-09-16T14:25:17.105Z. Initial publication at 14:22:18 UTC; a final protection pass prevents deletion/renaming/moving of locally staged issued PO documents and disables PO-controlled fields in the cost editor. Initial source/deployment/live evidence remains in the private backup.
- Source: 205 files; SHA-256 `fa766a76c9e91afa2923602e7a52f16298a9878a051be0f02aa00213503d780a`. [Source manifest](2026-09-16-po-source-manifest.json). Source includes the pre-existing uncommitted application work; Git HEAD alone is not the release identity.
- Applied only `20260916160000_finance_purchase_orders`; all 75 migrations applied. Transactional additive migration; existing orders retain legacy ownership. No estimates, old PO allocations or invoices migrated.
- Backup `/srv/backups/production-management-system/20260916T142121Z-finance-purchase-orders`: verified custom PostgreSQL dump, exact prior served frontend, environment/nginx, working source/disk build and hashes. Disposable test schemas excluded. Existing local storage retained in place, not copied by this release backup. Disk builds may differ from the earlier JS loaded in PM2; preserve known compatible release snapshots for recovery. An older app that lacks finance-managed PO protections should not manage new live-register orders.
- PM2 reload, local/public health and nginx validation passed. Static assets retained; index replaced atomically.
- [Live verification](2026-09-16-po-live-check.json): Home, Finance, Files/Drive connected, new-project wizard, quiet draft restoration, supplier purchase-order view, existing pilot costs/invoices/reconcile and mobile width; zero runtime errors. Workspace, finance and Drive authentication checks return 401 without a session. Temporary test session deleted afterward. No forms submitted.
- Read-only post-release counts: 9 projects, 0 finance-managed POs, 0 supplier invoices. No live supplier orders, invoices, emails or Drive files created for testing. A real first-project acceptance run remains outstanding.

## Validation

Backend/frontend builds; Prisma validation and actual migration in a disposable schema; nginx validation; full frontend lint (zero errors, one pre-existing SelectsPortal hook warning); clean changed-component lint; Markdown inventory/local links and all 33 archived-original hashes.

PO integration/browser suite: legacy preservation, number collision avoidance, duplicate/concurrent requests, supplier and project boundaries, stale edits, active-PO cost protection, immutable issued snapshots, EUR PDF currency/privacy, single-page footer layout, renderer retry, lost-file-link recovery, retained PDF delete/move rejection, partial invoice matching without double counting, cancellation guards and unchanged approved estimate. Browser flow covers cost → draft → issue → PDF → invoice → match PO → approve, on desktop and mobile.

Finance and new-project regression suites passed. Drive queue/OAuth integration, 403 diagnostics and SameSite callback tests passed. The Drive fixture now sets an explicit empty override when testing callback fallback so a service's dotenv reload cannot reintroduce the production redirect into the isolated fixture. No production OAuth settings changed.

## Remaining work

Client receivables/deposit tracking, credits/FX, formal issued-PO amendments, explicit supplier email/acceptance workflows, reviewed legacy migration and financial close. Issuing records a commitment and produces a PDF; it does not imply email delivery or supplier acceptance.
