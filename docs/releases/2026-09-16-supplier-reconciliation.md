# 16 September 2026 — supplier reconciliation

Status: deployed and live-verified at 2026-09-16T15:31:28.131Z.

The user authorised supplier invoice review, credits, payment reconciliation, financial overview and a close checklist, plus a fresh sample-project test. [Workflow and limits](../production-hub/SUPPLIER-RECONCILIATION.md).

## Change

Drive inbox review supports supplier invoices and credits, original-invoice/PO cost matching and manual-URL recognition. Duplicate document references are blocked; likely duplicates and above-PO charges have review notes. Supplier credits reduce actual cost without reopening the original allowance. Refunds due and recorded refunds are separate from payables. The Reconcile screen combines revenue, forecast profit, both sides of cash settlement and explicit Drive/source checks.

## Migration

`20260916190000_supplier_reconciliation` adds supplier document kind (existing default INVOICE), original-invoice relation, review note and payment direction (existing default PAYMENT), with indexes and reviewed credit/cash constraints. The old positive-net constraint is extended for tax-only credits. Existing financial records and approved estimates are retained.

## Validation and deployment

Release steps completed; evidence below. Test work uses isolated records and mocked Google calls; it does not publish real documents or move money.

## Deployment evidence

- Release `20260916T152742Z`, published 2026-09-16T15:31:28.131Z. Source SHA-256 `4be08946470091ba7ee7d9f64fd855004fc0e50e14915a833e9702f0dede68c6`, 214 files in the [source manifest](2026-09-16-reconcile-source-manifest.json). Existing uncommitted work is included; Git HEAD alone does not identify this release.
- Applied only `20260916190000_supplier_reconciliation`; all 78 migrations applied. Existing supplier rows default to INVOICE/PAYMENT. No financial records migrated.
- Backup `/srv/backups/production-management-system/20260916T152742Z-supplier-reconciliation`: verified custom PostgreSQL dump, exact prior served frontend, protected environment/nginx, source/disk build snapshot and hashes. Test schemas excluded; existing local storage retained in place, not copied. Disk snapshot may differ from older code previously loaded in PM2. Older financial code cannot safely interpret credit/refund rows; recovery needs a compatible backend.
- Backend/frontend builds, Prisma validation, nginx validation and PM2 reload passed. Local API readiness checked before static publication; old assets retained and index replaced atomically.
- [Live checks](2026-09-16-reconcile-live-check.json): Home, Finance, Files/Drive connected, new-project wizard, supplier PO/invoice views, Client billing, Reconcile API and ready-to-close checklist, mobile width and authentication. No runtime errors; temporary session deleted afterward. No business form submitted.
- Read-only production counts: 9 projects, 0 supplier documents, 0 supplier cash entries, 0 client documents and 0 client cash entries. Development tests create none of these in production. Real first-project acceptance remains outstanding.

## Validation

Supplier reconciliation integration applies the actual migration over a populated old supplier invoice/payment and verifies retained data/defaults. It runs a fresh project through estimate → approval → PO → Drive invoice → allocation → payment → credit → supplier refund → client invoice/payment → ready-for-final-review. It checks net forecast/profit, no reinstated allowance, per-original net/tax/cost caps, competing tax credits, project boundaries, duplicate references/URL forms, manual-link inbox recognition, likely-duplicate and PO-variance flags, refunds/reversals, source deletion, pagination and revoked Drive. Approved estimate snapshots remain unchanged.

Browser tests exercise paginated Drive credit review, original matching, suggested allocation, approval, supplier refund and reconciliation on desktop/mobile. Existing supplier finance, PO, new-project/estimate, client-credit and Drive queue/OAuth suites passed. Browser fixture timing was corrected to await inbox page completion; explicit select labels improve credit-review accessibility. Full frontend lint has zero errors and one pre-existing SelectsPortal hook warning; changed-component lint passed. Markdown inventory, local links and all 33 archived originals passed. Source hashes and public release marker are verified after publication.

## Scope and limits

Google and all financial writes in integration tests use isolated fixtures. No real project, invoice, payment, refund, message or Drive export was created by verification. Source scans are explicit (up to ten inbox pages and 100 approved/issued documents); nested folders and incomplete/access-failed scans remain flagged. Readiness is final review, not automatic closure or bank reconciliation. No OCR, automatic transfers, cross-invoice settlement, FX, formal PO amendments or permanent financial-close certificate is claimed. Approved supplier-credit amendments remain separate work.
