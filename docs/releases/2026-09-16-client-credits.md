# 16 September 2026 — client credit notes and corrections

Status: deployed and live-verified at 2026-09-16T15:06:06.890Z.

The user authorised client credit notes and issued-invoice corrections. [Workflow](../production-hub/CLIENT-CREDIT-WORKFLOW.md) adds partial/full/tax-only credits, linked replacement drafts, immutable Drive credit PDFs and recorded refunds/reversals. Client receivables and amounts owed back remain separate in project billing and Finance overview.

## Migration

`20260916180000_client_credit_notes` adds a restrictive original-invoice relation and indexed correction links; receipt direction defaults to RECEIPT, preserving existing rows. Reviewed amount checks permit positive tax-only credits while ordinary invoices still require positive net. No existing invoices, snapshots, receipts or supplier data are rewritten.

## Validation and deployment

Release steps completed; evidence below. No real credit notes, refunds, bank transfers, messages or Drive documents are created for testing.

## Deployment evidence

- Release `20260916T150439Z`, published 2026-09-16T15:06:06.890Z. Source SHA-256 `26b2b5003dd32d18a18b011eb198b89cf7c836e65aa358440877d4f58b29e8ad`, 210 files in the [source manifest](2026-09-16-credit-source-manifest.json). Pre-existing uncommitted work is included; Git HEAD alone does not identify this release.
- Applied only `20260916180000_client_credit_notes`; all 77 migrations applied. No existing financial records migrated.
- Backup `/srv/backups/production-management-system/20260916T150439Z-client-credits`: verified custom PostgreSQL dump, exact prior served frontend, protected environment/nginx, source/disk build snapshot and hashes. Disposable test schemas excluded; existing storage retained in place, not copied. Disk snapshot may differ from older code previously loaded in PM2. After real credits/refunds exist, older billing code cannot safely interpret them; retain a compatible backend for recovery.
- Backend/frontend builds, Prisma validation, nginx validation and PM2 reload passed. Local health was awaited before static publication; old assets retained and index replaced atomically.
- [Live checks](2026-09-16-credit-live-check.json): Home, Finance, Files/Drive connection, new-project wizard, purchase orders and supplier views, Client billing/refund summary, draft editor, reconciliation and mobile width. No runtime errors. Finance/Drive/workspace authentication enforced. Temporary session deleted afterward; no business form submitted.
- Read-only production counts: 9 projects, 0 client invoices/credits, 0 client receipts/refunds, 77 applied migrations. No client message or Drive document created for testing. First real-project acceptance remains outstanding.

## Validation

The credit integration suite applies the actual migration over a populated prior register and verifies retained original invoice/receipt data and the default RECEIPT direction. It covers partial/full/tax-only credits, original net/tax caps, competing credit issue, stale versions and retry deduplication, project/date/credit-of-credit guards, immutable original snapshots, linked replacements, paid credits and partial refunds/reversals, over-refund/reversal protections, separate receivable/refund totals, unchanged estimates/supplier costs, credit PDF privacy/currency/reference, renderer retry/crash recovery and issued-file delete/move protection.

Browser flow: credit draft → issue → PDF → refund → full credit → replacement draft. Desktop/mobile width and runtime checks passed. Existing client billing, supplier PO and Drive queue/OAuth regression suites passed. Full frontend lint has zero errors and one pre-existing SelectsPortal hook warning. Markdown inventory/local links and all 33 archived-original hashes passed. Source hashes and public release marker are checked after publication.

## Remaining limits

No automatic client email or bank transfer, no cross-invoice transfer of cash/credit, no correction/voiding of an issued credit note, no supplier credits, FX, bank sync or complete financial close. Credit notes do not change the approved estimate; changed commercial scope needs a revised approval. User-entered tax and document references remain explicit. Real Drive publishing of a reviewed client document has not been exercised by these tests.
