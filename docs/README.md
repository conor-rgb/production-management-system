# Documentation index — current direction

Reset 16 September 2026. The active direction is an incremental production hub on the existing VPS stack, with finance-first workflow consolidation and Google Drive project folders for files/exports. The old no-Drive rule and competing framework-rewrite assumptions are superseded.

## Read in this order

1. [BRIEF.md](../BRIEF.md): current product decisions and scope.
2. [Production hub plan](production-hub/PLAN.md): target workflows, ordering and release gates; planned work is not automatically delivered.
3. [Current handover](../HANDOVER.md), [changelog](../CHANGELOG.md), [release record](releases/2026-09-16-production-hub.md): what actually changed and shipped.
4. [Drive implementation](production-hub/DRIVE-IMPLEMENTATION.md) and [deployment runbook](deploy.md): present behaviour, activation and operations.
5. [AGENTS.md](../AGENTS.md) / [CLAUDE.md](../CLAUDE.md): working guidance pointing to the same direction.

The user's current instructions take priority. Product briefs describe intent; implementation/release records establish delivery evidence. Archived instructions do not govern new work.

## Current release state

The [supplier PO workflow](production-hub/PURCHASE-ORDER-WORKFLOW.md) extends live costs with commitments, documents and invoice matching. Check the [PO release record](releases/2026-09-16-finance-purchase-orders.md) for rollout evidence.

New-project work is documented in the [workflow](production-hub/NEW-PROJECT-WORKFLOW.md) and [latest release](releases/2026-09-16-new-project-workflow.md). The user prefers fresh projects; legacy migration is optional later work.

The application is deployed and live-verified. Drive consent and root-folder access are verified. Exact project links and a live publishing pilot remain outstanding. See [working with Google documents](production-hub/DRIVE-WORKFLOW.md). The [supplier finance pilot](production-hub/FINANCE-IMPLEMENTATION.md) adds independent costs, invoice allocations, partial payments and reconciliation exceptions; legacy migration, credits and FX remain outstanding. Manual workbook migration and bound-script parity remain outstanding.

## Reference map

| Document | Role |
| --- | --- |
| [Source audit](production-hub/AUDIT.md) | Dated pre-implementation findings and live-Sheets references |
| [Status-sheet workflows](status-doc-workflow.md) | Translate workflows into one project workspace; no extra spreadsheet database |
| [Workspace cleanup](v1-cleanup.md) | Delivered UI behaviour and retained editing limits |
| [Architecture](rebuild-audit/ARCHITECTURE.md) | Current stack and ownership |
| [API routes](rebuild-audit/API_ROUTES.md) | Current route surface, including Drive and nested selects |
| [Data model](rebuild-audit/DATA_MODEL.md) | Current additions plus explicitly dated historical model counts |
| [Entity ownership](rebuild-audit/ENTITY_INVENTORY.md) | Domains to preserve/consolidate |
| [Storage](rebuild-audit/STORAGE_AND_ASSETS.md) | Drive publication plus remaining local assets |
| [Integrations](rebuild-audit/INTEGRATIONS.md) | Actual versus planned integrations |
| [Environment](rebuild-audit/ENV_VARIABLES.md) | Configuration names, no secrets |
| [Migration risks](rebuild-audit/MIGRATION_RISKS.md) | Current preservation constraints; no session/empty-table deletion rule |
| [Data quality](rebuild-audit/DATA_QUALITY_ISSUES.md) | Dated evidence and migration acceptance |
| [Export scope](rebuild-audit/EXPORT_PLAN.md) / [utility](../scripts/legacy-export/README.md) | Read-only mapping tools, not deployment or full backup |
| [Frontend](../frontend/README.md) | Current UI development and fixtures |
| [Security](../SECURITY.md) | Current controls and limits |

## History and change discipline

[The dated archive](archive/2026-09-16-before-direction-reset/README.md) preserves 33 original Markdown files byte-for-byte, including the complete old handover and nine already-deleted files recovered from Git. Its manifest records SHA-256 and provenance. The July export validation report remains historical and was not regenerated as current evidence.

Every future feature change updates the changelog and current handover. Every deployment adds a release record with source/build identity, migration/backup/check results and integration activation state. Keep old records; date corrections. Never delete operational data based on an obsolete audit or edit historical results to claim new validation.

`node scripts/tests/docs-check.cjs` checks archival hashes, inventory coverage and active local links.

[Markdown inventory](markdown-inventory.json) records the disposition of every current and archived repository document. Generated customer exports and dependencies are not active project instructions. No external Google Drive Markdown documents were rewritten by this repository documentation reset.

## Client billing extension — 16 September 2026

[Client billing and receipts](production-hub/CLIENT-BILLING-WORKFLOW.md) now covers deposit/progress/final invoice drafts, protected issued PDFs in Drive, the approved net left to bill and partial receipts/reversals. Issuing does not send email. Credits, FX, banking sync and formal financial close remain outstanding. Check its release record for deployment state.

## Client credits extension — 16 September 2026

[Client credits and corrections](production-hub/CLIENT-CREDIT-WORKFLOW.md) implements client invoice credits, linked replacements and recorded refunds. Earlier outstanding-credit references now apply to supplier credits and remaining settlement workflows. FX, banking sync and formal financial close remain outstanding. Check the credit release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](production-hub/SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.
