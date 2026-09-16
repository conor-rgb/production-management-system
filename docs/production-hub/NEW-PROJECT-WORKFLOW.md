# New project budget and Drive workflow

16 September 2026. The user now prefers starting fresh projects; legacy migration is not a prerequisite. This extends the [supplier register](FINANCE-IMPLEMENTATION.md) on the existing stack. Deployed and live-verified on 16 September 2026; evidence is in the [release record](../releases/2026-09-16-new-project-workflow.md).

## Delivered behaviour

Projects → New creates a stills, motion, event or simple starter estimate in GBP/EUR/USD/CHF/CAD/AUD. Project creation is transactional and request-idempotent. Job-code allocation serialises with other app allocation, skips existing app codes and reads existing Drive root codes when Drive setup is selected. It never infers a folder link from a code match. Existing projects retain workspace version 1 and their existing estimate editor; new projects use version 2.

The estimate has separate client rate, planned supplier rate and supplier fields; quantities/days; line add, duplicate and remove; section naming; tab-separated paste; local undo; fee and insurance percentages; client assumptions/payment terms; internal notes. Blank supplier rates remain explicitly unpriced. Saves are atomic and check the revision edit version. Unsaved drafts are retained in browser session storage when the same saved revision is reopened. Another saved version invalidates that local draft rather than silently overwriting it. Browser refresh has an unsaved-change warning.

Record client approval confirms an approval received elsewhere; it does not send a message or obtain a signature. Approval freezes a revision snapshot and captures client revenue and planned supplier cost in integer minor units. New stable estimate lines seed **planned allowances**, not supplier commitments, in the independent register. Existing live costs are never overwritten by a subsequent estimate approval. Review revised or removed allowances manually. A new draft preserves the previous approval and stable line identities. Duplicate lines get new identities.

Live costs distinguish planned from committed. Confirm the supplier and cost status as bookings are agreed. The latest approved client estimate is compared with the operational forecast for margin; prior approved versions are not added together. Invoices, net allocations, partial gross payments, corrections and reconciliation use the existing independent finance register. A payment entry records money already paid; no bank transfer occurs.

Client PDFs are marked draft or approved and use the existing branded renderer. Planned supplier rates, supplier names and internal notes are excluded. Exports are separate documents filed to Drive through the durable publishing queue. Re-export is an explicit new file; upload retries for one file reuse its reserved Drive identity. Native Slides/Docs are opened by their existing Drive IDs and remain editable in Google.

## Drive organisation for new projects

New project root: `<job code> | <project name>` under the configured `_PROJECTS` root. These destinations inherit that root's access; category names do not create private permissions.

| App category | New project Drive destination |
| --- | --- |
| Briefs | 01 Brief & scope |
| Estimates | 02 Client estimates |
| Budgets | 03 Internal finance |
| Contracts / Crew Deals | 04 Supplier POs & contracts |
| Invoices / Receipts | 05 Supplier invoices |
| Client Invoices | 06 Client invoices |
| References / Selects / Mail Attachments | 07 Production documents |
| Delivery | 08 Deliverables |
| Reconciliation | 09 Reconciliation |

Creation queues folder setup, so a saved project/estimate survives later Drive failure. The worker provisions folders using project-specific app properties and a project database lock. Retry discovers previously created folders after a lost response. Status is pending, ready or error; Costs → Estimate shows the error/retry action. File exports made during pending/error setup remain queued until the project folder exists. Uploads target mapped category IDs and recheck ancestry. Legacy projects keep their existing `Production Hub/<category>` destinations. Existing customer Drive folders are not renamed, moved or migrated by this release.

Invoices → From Google Drive reads the mapped supplier-invoice folder on opening, focus and Refresh, with pagination. Review opens a draft invoice with the document attached; supplier/number/dates/net/tax still require human entry. The server verifies that the selected file is inside this project's linked Drive root. One Drive file cannot become two invoice records in the same project. Files uploaded through Project Files → Invoices use the same destination once published. This is live folder reading, not a whole-Drive index, webhook synchronisation or automatic accounting extraction.

## API and data

Authenticated `/api/project-workspace` provides creation, templates, project/estimate retrieval, save/approve/version actions, client PDF export and Drive retry. `/api/project-finance/:id/drive-inbox` provides the invoice folder view. Existing finance actions accept planned/committed cost status and a verified invoice Drive file ID.

Migration `20260916150000_new_project_workflow` adds project workflow/setup fields, revision edit versions, optional planned rates/suppliers and stable cost identities, project/category Drive mappings, immutable approval snapshots, optional finance estimate keys and invoice Drive IDs. Existing line IDs backfill stable keys. Existing costs default to committed and existing projects default to workspace version 1. No financial data is imported or deleted.

## Validation and remaining work

`scripts/tests/project-workspace-integration.cjs` runs in a disposable schema with mocked Google: actual migration/backfill, concurrent creation/approval, code collisions, lost-response folder recovery, stale saves, approved snapshot preservation, revised estimate handoff, PDF privacy, mapped upload, invoice boundaries/duplicates, and desktop/mobile browser workflow. Finance and Drive regression suites cover allocations/payments and queued uploads. Tests do not create live finance records or Google folders.

The subsequent [supplier PO workflow](PURCHASE-ORDER-WORKFLOW.md) connects draft/issued orders and supplier PDFs to the live register. Still outstanding: credits, FX, automatic extraction, reviewed legacy migration, revision comparison/reconciliation automation, formal close, project access controls and a live first-project acceptance run. Starter templates seed estimates and folders; they do not dynamically hide project modules. No general in-app AI agent was requested.

## Client billing extension — 16 September 2026

[Client billing and receipts](CLIENT-BILLING-WORKFLOW.md) now covers deposit/progress/final invoice drafts, protected issued PDFs in Drive, the approved net left to bill and partial receipts/reversals. Issuing does not send email. Credits, FX, banking sync and formal financial close remain outstanding. Check its release record for deployment state.

## Client credits extension — 16 September 2026

[Client credits and corrections](CLIENT-CREDIT-WORKFLOW.md) implements client invoice credits, linked replacements and recorded refunds. Earlier outstanding-credit references now apply to supplier credits and remaining settlement workflows. FX, banking sync and formal financial close remain outstanding. Check the credit release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.

## Supplier currencies and bookings extension — 16 September 2026

[Supplier currencies and linked bookings](FX-AND-BOOKINGS.md) supersedes earlier outstanding-FX references for reviewed original supplier amounts, conversion and actual settlement differences. Crew bookings now connect project dates to one supplier cost. Automatic market-rate retrieval, bank feeds, formal PO amendments and formal financial close remain outstanding. See the latest release evidence for deployment state.
