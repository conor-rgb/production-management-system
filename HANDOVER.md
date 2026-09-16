# Current handover — production hub direction reset

Updated 16 September 2026. The complete previous 4,398-line handover is preserved [here](docs/archive/2026-09-16-before-direction-reset/HANDOVER.md). Old “next steps” are historical, not the current backlog.

## Latest live setup — Yves Rocher Hair Lab fresh workspace

User-authorised refresh of existing project 2655, preserving its ID and exact linked Drive folder. Replaced the active unpriced legacy estimate with a fresh GBP motion draft (20 unpriced lines across five sections); previous draft retained in version history and a verified private database/project backup. Scope: one influencer exploring hair science in a Paris lab. No shoot duration, supplier price, exchange rate, fee, approval or payment has been assumed.

Created nine numbered destinations inside the existing project folder and mapped all file categories. Live desktop/mobile checks passed with no browser errors; one explicitly unpriced draft PDF was exported, published to Client estimates and downloaded through Drive successfully. Client PDF scope says it is not a quotation; internal notes are excluded. No invoice, commitment or cash entry created.

This is a live project setup, not a software deployment or completed financial acceptance. GBP invoicing is configured; automatic EUR supplier conversion remains outstanding and must precede foreign-currency invoice entry. Setup and export evidence are retained in the private backup.

## Supplier reconciliation — latest work

The user authorised supplier credits, Drive review, PO matching, financial overview and a ready-to-close checklist. [Supplier reconciliation](docs/production-hub/SUPPLIER-RECONCILIATION.md) is implemented, including supplier refunds, duplicate/variance review, source verification and separate payable/refund balances. A fresh isolated project exercises the complete estimate-to-reconciliation flow. Deployed and live-verified at 2026-09-16T15:31:28.131Z; all 78 migrations applied. [Release record](docs/releases/2026-09-16-supplier-reconciliation.md). No real financial records or Google documents are created for testing.

## Client credits — latest work

The user authorised credit notes and issued-invoice corrections. [Client credit workflow](docs/production-hub/CLIENT-CREDIT-WORKFLOW.md) adds partial/full/tax-only credits, immutable linked documents, replacement drafts and refund records/reversals. Client receivables and refund amounts are reported separately. Deployed and live-verified at 2026-09-16T15:06:06.890Z; all 77 migrations applied. [Release record](docs/releases/2026-09-16-client-credits.md). No real credit notes or refunds are created by tests.

## Client billing — latest work

The user authorised client invoices, deposits and receipt tracking. [Client billing](docs/production-hub/CLIENT-BILLING-WORKFLOW.md) is implemented with reviewed drafts, protected issued PDFs in Drive, approval caps, deposit-to-final net balances, partial receipts and reversals. Deployed and live-verified at 2026-09-16T14:46:08.746Z; all 76 migrations applied. [Release record](docs/releases/2026-09-16-client-billing.md). Tests create no live invoices, receipts or client messages.

## Supplier POs — latest work

The user's “continue” advances the next finance slice: [supplier POs linked to live costs](docs/production-hub/PURCHASE-ORDER-WORKFLOW.md). Draft/review/issue, immutable supplier snapshots, Drive-filed PDFs, invoice matching and cancellation checks are implemented. The existing PO generators share numbering with the new flow. Deployed and live-verified at 2026-09-16T14:25:17.105Z; all 75 migrations applied. [Release evidence](docs/releases/2026-09-16-finance-purchase-orders.md). No live PO or supplier message is created by development tests.

## New projects — latest work

The user now prefers starting fresh and authorised substantial app rework with Drive integration. The [new project workflow](docs/production-hub/NEW-PROJECT-WORKFLOW.md) implements template setup, cleaner estimates, separate planned supplier pricing, immutable recorded approvals, planned-cost handoff, mapped Drive folders and invoice-folder review. Existing projects retain their old editor and records. Deployed and live-verified at 2026-09-16T13:48:53.769Z; all 74 migrations applied. Deployment evidence: [release record](docs/releases/2026-09-16-new-project-workflow.md). This supersedes legacy migration as the immediate next step.

## Finance pilot — latest work

French Hair Lab is the selected pilot. Deployed and live-verified at 2026-09-16T13:00:47.156Z. All 73 migrations are applied. The independent supplier register now has commitments, invoice net allocations, partial-payment records, corrections and reconciliation exceptions; the existing estimate editor remains. [Implementation](docs/production-hub/FINANCE-IMPLEMENTATION.md) and [release](docs/releases/2026-09-16-finance-register.md) define scope and verified deployment state. No actual financial rows have been migrated or inserted. The pilot has a GBP draft estimate and zero current-revision supplier cost rows. Subsequent releases add supplier POs and client billing; FX and formal close remain outstanding.

## Current decision

Retain the existing React/Vite + Express + Prisma/Postgres stack. Build a clean project workspace; use Google Drive project folders for files/exports; prioritise budgets, invoices and reconciliation. [BRIEF.md](BRIEF.md) and [PLAN.md](docs/production-hub/PLAN.md) govern direction. The old no-Drive rule and parallel platform-rewrite assumptions are superseded.

## This release

- Home/Actions/project navigation and command search; simpler global navigation.
- Slim project-summary API for Home, Actions, project index, Files and command search; thread summaries no longer fetch full email bodies.
- Finance index replacing the empty Budgets landing page, with saved totals and links into Costs/POs/documents.
- Drive OAuth, `_PROJECTS` root, exact folder linking/new-folder creation, browse/pagination, persistent publishing queue, reserved file IDs for retry safety, and Drive-backed downloads.
- Documentation reset with byte-preserved historical files, a manifest, current runbook and restored changelog.

Deployment completed and live checks passed at 2026-09-16T11:55:17.403Z. All 72 migrations are applied; PM2 is online. Live project summary: 9 rows / 4,421 bytes in one observed request. Drive consent subsequently completed at 12:30:50 UTC; token refresh, root read and write capability are verified.

Deployment evidence is tracked in [the 16 September release record](docs/releases/2026-09-16-production-hub.md). Use its final status rather than assuming a build is live. Only migration `20260916130000_project_drive_storage` was pending at preflight; the earlier 71 migrations were already applied.

## Not complete

Exact project linking/live publishing pilot; reviewed legacy migration, FX and formal close; workbook/domain ownership cleanup; parity review of working bound Apps Scripts; per-project staff access controls. Existing local assets and direct filesystem paths remain necessary. No full financial ledger, whole-Drive import or complete bidirectional file synchronisation is claimed.

## Existing-session callback correction

The subsequent Unauthorised callback was caused by stored SameSite=Strict cookies surviving the prior configuration change. Drive OAuth start now upgrades the session cookie to Lax. A live browser using a Strict session successfully returned from Google to authenticated cancellation validation. Users must start a fresh connection from Files; the old failed callback URL cannot repair its cookie.

## Activation history — resolved

After the cookie fix, the user received a Drive 403 during connection. The old handler discarded its specific reason. The deployed handler now distinguishes a disabled Drive API, missing consent, Workspace policy and quota from folder access failures using known provider reason codes. Confirm Drive API is enabled in the same Cloud project as the OAuth client, then retry consent and inspect the improved error if needed. Do not claim the exact cause is confirmed.

## Current document workflow

The user clarified that working from Drive means adjusting a Google Slides presentation, not editing financial Sheet cells. The app should open the same native file. [Document workflow](docs/production-hub/DRIVE-WORKFLOW.md) records immediate use and next organisational improvements. Existing project folders have usable categories, but several app/Drive job codes disagree (French Hair Lab is 2655 in the app, 2657 in Drive). Hair Lab is now explicitly linked; preserve its exact folder ID and do not match other projects on code alone.

## Next action

Continue with the refreshed Yves Rocher Hair Lab project (2655), now workspace version 2 with a GBP motion estimate and verified live Drive export. Next engineering requirement: EUR supplier originals, reviewed FX rate/date/source, GBP budget valuation and actual settlement differences; do not treat EUR figures as GBP. Then price the draft using real quotes and confirmed deliverables. Financial approvals, supplier invoicing and full live reconciliation remain unverified. The user has authorised refreshing this project; no further reset permission is needed.

Use [docs/deploy.md](docs/deploy.md) for future releases. Preserve the current working tree: it contains pre-existing uncommitted features as well as this session's changes. Source manifests distinguish the deployed snapshot from Git HEAD.

## Observed operational warning

Post-reload Gmail sync logged a missing remote thread (404). Record/review stale history handling separately; do not wipe mail data. The API and live Home/Finance/Files/mobile checks passed.
