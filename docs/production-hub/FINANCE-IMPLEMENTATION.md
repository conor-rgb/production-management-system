# Independent project cost register

16 September 2026. Implemented, deployed and live-verified for the French Hair Lab pilot; release status and verification are recorded in [the finance release](../releases/2026-09-16-finance-register.md). This is the first supplier-finance slice, not the completed accounting/close model in [PLAN](PLAN.md).

## New-project extension

The user subsequently chose to start fresh. [New project workflow](NEW-PROJECT-WORKFLOW.md) adds starter estimates, immutable recorded approvals, planned allowances distinct from commitments, approved-revenue margin and the Drive invoice inbox. Version 1 projects retain the pilot behaviour below. Latest deployment: [new-project release](../releases/2026-09-16-new-project-workflow.md).

## Purchase order extension

[Supplier POs](PURCHASE-ORDER-WORKFLOW.md) now reserve live costs, set agreed commitments at issue, file immutable supplier PDFs to Drive and suggest invoice allocations. Legacy records remain independent until reviewed migration.

## Pilot grounding

Read-only inspection found French Hair Lab (`cmtvd9fsm000m111brx230zdb`, app job code 2655) has a GBP draft estimate, revision 1, and zero SubCost rows in that revision. No actual financial figures were changed or copied during implementation. Its Drive folder identity still needs explicit reconciliation with `2657 | Hair Lab`; do not infer folder links from the app code.

## User workflow

Project Costs has four views:

- **Estimate:** the existing estimate editor, revisions and exports. Existing supplier records remain accessible here until reviewed migration.
- **Live costs:** independent supplier commitments with stable IDs, approved invoice allocations, remaining work and forecast cost.
- **Invoices:** supplier invoice drafts, original document links, net/tax amounts, allocations to one or more costs, approval, payment history and corrections.
- **Reconcile:** drafts needing review, outstanding/overdue gross balances, remaining unbilled work and forecast-over-commitment exceptions. An empty exception list covers this register only; it does not mark a project financially closed.

An invoice must link its source Google document and allocate its full net amount before approval. Approving recognises its net amount against costs. Payments settle its gross amount and do not increase costs. Record payments already made; this feature never sends money.

Example: a £1,000 commitment receives a £600 net / £720 gross invoice. Forecast remains £1,000 (£600 recognised + £400 remaining). Payments of £400 and £320 settle the £720 invoice; the cost forecast stays unchanged. A second £400 net invoice consumes the remaining commitment.

One invoice may split across several costs for the same supplier/project. Several invoices may allocate to one cost. Supplier matching is normalised text in this initial slice, not a full supplier identity merge. No fuzzy matching or automatic bank reconciliation is implemented.

## Calculation and validation

Amounts are integer minor units. API inputs are decimal strings with at most two fractional digits and a per-field cap of 1,000,000,000 minor units. Costs/remaining work and tax can be zero; invoice net, payment and allocation amounts must be positive. Supported project currencies are GBP, EUR, USD, CHF, CAD and AUD. Every write explicitly supplies the register currency; no cross-currency totals or implicit FX conversions are allowed.

For each cost:

- Recognised cost = net allocations from APPROVED invoices only.
- Default remaining work = max(commitment − recognised cost, 0).
- Forecast = recognised cost + remaining work.
- A manual remaining-work override replaces the default; it represents unbilled work only.

Draft and void invoices are excluded from recognised costs and supplier balances. Supplier balance = approved invoice net + tax − unreversed recorded payments. A payment cannot exceed that balance. Forecast over commitment stays visible instead of being silently capped.

The Finance index separately labels existing estimate-workflow figures and new-register forecast/balance. They are never added together. New-register summaries and project details use the same calculation basis and repeatable-read snapshots. Legacy project-header totals/estimate PDF actuals are not migrated by this release.

## Correction and concurrency

Draft invoices can be edited, reallocated or voided. Approved invoices can reopen to draft with a reason only after all recorded payments have been reversed. Reopening removes the invoice from recognised totals until reapproval. This is an internal record correction, not a supplier credit-note workflow.

Recorded payments are retained; correction records reversal time/reason and restores the outstanding balance. The original payment remains in history. This does not reverse a bank transfer.

All writes acquire a per-project transaction lock. Each carries an idempotency request ID and payload hash, so a retry reuses its first committed result. Reusing the ID for different data fails. Updates require the expected record version; stale changes fail with a refresh message. Supplier/invoice-number uniqueness prevents duplicate invoices after a new request ID. An unreversed payment with the same invoice/date/amount/normalised reference is also rejected as a possible duplicate. Audit entries commit in the same transaction as the mutation and preserve the actor, action, input and previous record state.

The register never writes Budget, BudgetRevision, BudgetLineItem or SubCost. Read endpoints do not create a ledger or materialise records. This was verified against an approved, locked estimate fixture through invoices, allocations and payment corrections.

## Storage and routes

Additive migration `20260916140000_project_finance_ledger` creates six tables: project ledgers, costs, supplier invoices, invoice allocations, payments and operation history. Foreign keys, uniqueness constraints and nonnegative/positive amount checks supplement application validation. Existing tables/data are not rewritten. Ledger records restrict project deletion rather than silently cascading financial history.

Session-authenticated routes:

- GET `/api/project-finance`: small cross-project register summaries.
- GET `/api/project-finance/:productionId`: project register, calculated totals, legacy current-revision cost count and recent operation labels.
- POST `/api/project-finance/:productionId/actions/:action`: cost create/update; invoice create/update/allocate/approve/reopen/void; payment record/reverse.

The current app remains single-team. This does not add project-level staff permissions. Source document URLs are restricted to HTTPS Google Drive/Docs hosts; recording a URL does not independently verify the document's identity, content or sharing permissions.

## Remaining gates

- Review a real French Hair Lab invoice/commitment and its accepted closing figures before declaring the pilot financially validated. No production financial test rows were inserted.
- Bring existing POs, receipts and older job costs across with source mapping and explicit reconciliation. Existing tools continue to use their original records; do not enter the same expense in both workflows.
- Add credit notes, payment allocations across invoices, FX evidence, cross-invoice client receipts before claiming complete financial close/margin reporting.
- Add document upload/extraction into this register and receipt/PO lifecycle integration. The current invoice form links an existing Drive document.
- Broaden exception navigation and volume tests before large-job rollout.

## Client billing extension — 16 September 2026

[Client billing and receipts](CLIENT-BILLING-WORKFLOW.md) now covers deposit/progress/final invoice drafts, protected issued PDFs in Drive, the approved net left to bill and partial receipts/reversals. Issuing does not send email. Credits, FX, banking sync and formal financial close remain outstanding. Check its release record for deployment state.

## Client credits extension — 16 September 2026

[Client credits and corrections](CLIENT-CREDIT-WORKFLOW.md) implements client invoice credits, linked replacements and recorded refunds. Earlier outstanding-credit references now apply to supplier credits and remaining settlement workflows. FX, banking sync and formal financial close remain outstanding. Check the credit release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.
