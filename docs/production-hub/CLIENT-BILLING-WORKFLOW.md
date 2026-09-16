# Client billing and receipts

Implemented and deployed 2026-09-16T14:46:08.746Z. Deployment state and evidence: [release record](../releases/2026-09-16-client-billing.md).

## Working flow

Open a project's Costs → Client billing. Record approval of the client estimate before issuing invoices. Create deposit, progress or final drafts with the client's legal name/address, unique business invoice reference, explicit net and tax amounts, dates, client-facing description and payment instructions. The app does not infer tax treatment, bank details or an accounting numbering sequence.

The 50% and remaining-net shortcuts use the latest approved net less previously issued invoices, after issued credits. They never add previously billed deposits to the final invoice. Review the draft PDF, then confirm issue. Issuing freezes the document snapshot and starts durable PDF publication into Client Invoices (new projects map this to **06 Client invoices**). It does not email the client or record a receipt.

Record money already received, including partial receipts, with its bank date and reference. The gross balance falls by active receipts; the net amount left to bill depends on issued invoices and credits, not cash received. Correcting a receipt reverses its ledger entry while preserving history. It does not refund or move money.

## Financial controls

- Project writes serialize with the existing finance lock. Request IDs prevent retry duplicates; record versions reject stale edits.
- Invoice references are normalized to uppercase and unique across this client register, including void drafts. They are not reconciled against external accounting software.
- Issue requires a recorded estimate approval in the register currency and cannot exceed its remaining approved net. Extra work needs an approved revised estimate. A later reduced approval produces an overbilling exception.
- Drafts and void drafts do not contribute to billed/received/outstanding totals. Only drafts can be edited or voided; voiding requires an audit reason.
- Receipts require an issued invoice, a positive amount, a non-future date and reference. Overpayments and obvious duplicate entries are rejected. No cross-invoice receipt allocation is claimed.
- Supplier invoices, cost forecasts and immutable estimate approvals are not changed by client billing. Finance overview shows supplier and client balances separately. Project Reconcile lists client drafts, balances and failed documents.

## Documents and recovery

Client PDFs use an explicit field allowlist and existing company branding. Supplier prices, margins, project notes and internal estimate data are excluded. Payment instructions are entered by the operator and frozen on issue. Issued documents retain the original total; receipt history stays in the app rather than rewriting the invoice.

Document creation is queued independently from financial issue. Renderer failures are retryable. A unique source key recovers a crash after filing without creating a second document. The existing Drive publication queue then handles uploads and retries. A local PDF on an unlinked project must be published after its folder is configured; the UI explains that state. App file delete/move/rename operations reject issued invoice PDFs, even before Drive publication. Drive users' own edit/delete permissions are not changed by this feature.

## Limits and validation

The subsequent [credit-note workflow](CLIENT-CREDIT-WORKFLOW.md) adds invoice corrections and recorded refunds while preserving issued documents. Single project currency only; no FX, automatic banking, external accounting sync or automatic client email. Review entered tax and numbering against the business's accounting process. This is not a claim of complete financial close.

The isolated integration suite covers the actual additive migration, deposit/final billing, approval cap, cross-project boundaries, duplicate requests/references, stale edits, partial receipt/reversal/overpayment, document retry/crash recovery, EUR PDF privacy and protected files. The browser flow creates and issues a draft, opens its document link and records a partial receipt. Live checks are read-only; a first real project acceptance run remains outstanding.

## Credit extension — 16 September 2026

[Client credits and corrections](CLIENT-CREDIT-WORKFLOW.md) add draft/review/issue credit notes, separate refund-due totals, recorded refunds and linked replacements after a full credit. Existing issued invoices and their PDFs are never rewritten. Check the new release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.
