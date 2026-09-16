# Supplier purchase orders linked to live costs

16 September 2026. Extends the [new-project workflow](NEW-PROJECT-WORKFLOW.md). Deployed and live-verified at 2026-09-16T14:25:17.105Z. Deployment evidence: [release record](../releases/2026-09-16-finance-purchase-orders.md).

## Workflow

1. Assign a supplier to a live cost. Choose **Create PO** on that row, or open **Costs → Purchase orders → New purchase order** and select costs for the same supplier.
2. Enter agreed net amounts, optional supplier email, supplier-facing scope and terms. Save a draft and preview its PDF. The draft reserves those costs but does not change their committed amounts or forecast.
3. **Issue PO** freezes the supplier agreement, sets the selected costs to committed at the agreed amounts, and queues its PDF. Issuing creates a document and records the commitment; it does not send an email or obtain supplier acceptance.
4. The document worker files the issued PDF to Contracts, mapped to `04 Supplier POs & contracts` for new projects. The normal Drive queue publishes it. The PO view refreshes pending publication, offers download/Drive links, and exposes PDF errors/retry. Drive publication errors use Files & publishing.
5. Review a supplier invoice, then use **Allocate costs → Match an issued PO** to suggest allocations from its unbilled balances. Review and save those amounts before approving. Invoices may be split across costs and multiple invoices can draw against one PO. An invoice above the remaining PO balance requires explicit allocation of the extra amount.
6. PO cards show agreed net, approved invoiced net and unbilled balance. Reconciliation flags drafts, failed documents and invoices above the PO total.

The PO uses the same stable live costs as invoice allocations. Its total is not added to the cost register as another expense. For example, an £800 commitment with a £300 approved invoice forecasts £800 (£300 invoiced + £500 remaining), not £1,100. Payments continue to settle gross invoice balances separately.

## Change and cancellation rules

Each cost can belong to one active PO. Drafts can change agreed amounts and supplier-facing text; cancel/recreate a draft to change its selected costs. While reserved, supplier, commitment amount and commitment status cannot be changed directly in the cost editor. Internal cost description and remaining-work forecasts can still change; the PO line wording remains the explicitly reviewed snapshot.

Issued PO scope, amounts and document snapshots are immutable through the app. An uninvoiced PO can be cancelled with a reason. Cancelling an issued PO returns the costs to planned allowances, preserves their amount/remaining-work forecast, releases the reservation and retains the original document as history. It does not silently zero a forecast or retract a document already shared. Any non-void invoice allocation blocks cancellation until reviewed correction. No supplier message is sent by cancellation.

A billed PO is not silently repriced. Additional work can be a separate live cost and PO. Formal issued-PO amendments, supplier acceptance/signature tracking and an explicit send-email workflow remain future work. A PDF download does not imply delivery to the supplier.

## Data and document ownership

The existing `PurchaseOrderGroup` owns both legacy and finance-managed orders. Finance-managed POs have a dedicated marker, currency, edit version, supplier terms, issue actor/time, cancellation reason, immutable document snapshot and document queue state. `ProjectPurchaseOrderLine` links frozen net amounts/descriptions to stable finance costs. `ProjectFinanceCost.activePurchaseOrderId` reserves those costs. No BudgetRevision or SubCost writes occur in the new PO lifecycle.

The legacy multi-line and single-line generators now use the same transactionally reserved production sequence as live-register POs. The allocator checks existing group and SubCost references before returning a number. Legacy PO screens retain their existing records, excluding finance-managed POs. Legacy mutation/send/convert/export routes reject finance-managed IDs; new-project creation is directed to the live-cost flow. The new project's old POs navigation entry opens the live-register PO screen.

`JobFile.sourceKey` is an optional unique document identity. Issued PO generation uses a stable source key so retries recover the already-filed document after a crash before the PO's file link commits. The Drive queue's reserved remote ID then prevents duplicate upload of that file. Original local source files are retained. Issued PO files cannot be deleted, renamed or moved through the app, including while still local or after cancellation. The guard runs before any filesystem deletion.

Supplier PDFs use the existing branding module and an explicit supplier-facing snapshot: project name/code, supplier name/email, PO number/currency/date, agreed line descriptions/net amounts, scope and terms. Client estimate rates, margin, internal project/estimate notes and private budget comments are excluded. Currency follows the project ledger rather than a fixed pound symbol. Draft previews are temporary, clearly marked and not filed to Drive.

Migration `20260916160000_finance_purchase_orders` is additive and transactional. Existing POs default to legacy ownership; no records are moved or imported. It adds the ISSUED enum value, PO workflow/document fields, stable cost links, a line table, foreign keys, unique source-file identity and a positive-net line constraint.

## Verification and limits

`scripts/tests/finance-po-integration.cjs` builds the preceding schema, seeds a legacy PO, applies the actual migration and runs isolated tests for number collision avoidance, project/supplier boundaries, duplicate/concurrent requests, stale versions, reservation restrictions, immutable approval/PO snapshots, partial invoices without double counting, cancellation guards, PDF privacy/currency/pagination, render failure/retry and recovery after filing before linking. Browser coverage follows live cost → PO → issue → PDF → invoice → PO allocation → approval, including desktop/mobile rendering. Legacy mutation routes are checked for rejection. Existing finance, new-project and Drive suites remain regression coverage.

Tests use disposable database schemas and local fixtures. No live supplier orders, invoices, emails or Drive files are created for verification. A real first-project acceptance run remains outstanding. Legacy PO allocations are not automatically imported. credits, FX, formal PO amendments and financial close remain future work.

## Client billing extension — 16 September 2026

[Client billing and receipts](CLIENT-BILLING-WORKFLOW.md) now covers deposit/progress/final invoice drafts, protected issued PDFs in Drive, the approved net left to bill and partial receipts/reversals. Issuing does not send email. Credits, FX, banking sync and formal financial close remain outstanding. Check its release record for deployment state.

## Client credits extension — 16 September 2026

[Client credits and corrections](CLIENT-CREDIT-WORKFLOW.md) implements client invoice credits, linked replacements and recorded refunds. Earlier outstanding-credit references now apply to supplier credits and remaining settlement workflows. FX, banking sync and formal financial close remain outstanding. Check the credit release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.
