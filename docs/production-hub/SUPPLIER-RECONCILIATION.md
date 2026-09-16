# Supplier credits and project reconciliation

Implemented and deployed 2026-09-16T15:31:28.131Z. Deployment evidence: [release record](../releases/2026-09-16-supplier-reconciliation.md). Extends the existing estimate, PO, supplier register and client-billing flows.

## One review flow

Costs → Invoices reads the mapped Supplier invoices folder in Drive. Review a file as either an invoice or supplier credit note. Pick its supplier from existing project names, enter the document reference, dates, net and tax, and save a draft. Credit notes must select an approved original invoice in the same project; the supplier is inherited. The app does not infer amounts or perform OCR.

The inbox recognises both files imported through its review button and existing records linked by a pasted Google document URL. In-register links jump to the matching card. Alternate URL formats for the same Drive file cannot create a second record. Supplier reference uniqueness remains enforced, including void history.

Allocate invoice net to live costs; **Match an issued PO** suggests its remaining original allowance. Credit notes can use **Suggest original invoice allocation**, then review the split. Credit allocations cannot exceed the original invoice's remaining allocation on any cost. Net and tax each have their own original-invoice cap; tax-only credits require no net allocation.

Cards flag possible duplicates (same supplier, type, date, net and tax with different references) and allocations above issued PO lines. Compare source documents and record a review reason if the charge is valid. The review note does not itself approve the invoice. Material draft edits, reallocation and reopening clear the note. Exact duplicate references/documents are rejected; similarity and price-variance flags are review signals, not automatic rejection of valid charges.

## Credit and cash integrity

Approving a credit reduces actual net cost and the original invoice's gross balance. It does not edit the original source invoice, increase revenue, or silently reopen the original PO allowance. Forecast = original approved net allocations − approved credit allocations + remaining work. Automatic remaining work is commitment less original invoice allocations; enter a remaining-work override when replacement work is actually expected.

Payments and refunds are recorded against the approved original invoice. A credit against a paid invoice creates a supplier refund due. Partial refunds and reasoned reversals retain history. Payables and refunds due are reported separately, never netted away across invoices. Reversing a payment is blocked if that would leave more refunded than paid; correct erroneous refunds first. No entry initiates a bank transfer.

Approved credit notes and originals with active credits stay fixed. Draft credits can be voided; issued/approved-credit amendments and transfers across invoices are not implemented. All writes share project locking, request-id deduplication, record versions and audit history. Credit caps are rechecked on approval under the lock.

## Ready to close?

Costs → Reconcile shows approved revenue, forecast cost, expected net profit, supplier/client payments due and supplier/client refunds due together. Its checklist includes:

- Missing approval or unfinished estimate revision; legacy records requiring separate review.
- Remaining planned/unbilled work, draft POs and unpublished issued documents.
- Draft invoices/credits, unsettled cash, unreviewed duplicate or PO-variance flags.
- Unbilled/overbilled client revenue, client drafts and remaining refunds.
- Drive inbox documents not yet in the register, missing/inaccessible/out-of-project sources, and incomplete folder checks.

Drive validation is explicit and separate from fast ledger reads. It scans up to ten inbox pages and verifies up to 100 approved/issued supplier, PO and client documents in batches. Nested folders, pagination limits, unavailable Drive and missing sources prevent a clear result. Rerun after outside-app file changes. A mapped invoice folder is required for a complete check.

A clear result means **ready for final review**, not bank reconciliation, approval of unrecorded expenses or an automatic project-status change. The checklist does not create a permanent financial-close certificate. Currency conversion, external accounting/bank reconciliation, formal PO amendments and legacy migration remain separate work.

## Validation and sample project

The isolated integration test applies the actual additive migration over an existing supplier invoice and payment. It then creates a fresh project and runs estimate → recorded approval → PO → Drive invoice → cost allocation → payment → supplier credit → refund → client invoice/payment → reconciliation. It verifies forecast/profit, no reopened allowances, credit caps/allocations and concurrent tax credits, duplicate URL handling, review flags, pagination, source deletion/access failure, unchanged approvals and old-row defaults.

Browser tests exercise a paginated Drive credit review, original-invoice selection, suggested allocation, approval, refund and final-review checklist on desktop/mobile. Google responses and financial records are fixtures in an isolated schema. No real project, payment, credit, refund or Drive document is created for testing. A real first-project acceptance run remains outstanding.
