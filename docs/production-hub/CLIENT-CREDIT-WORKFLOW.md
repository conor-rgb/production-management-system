# Client credit notes and invoice corrections

Implemented and deployed 2026-09-16T15:06:06.890Z. Deployment state: [release record](../releases/2026-09-16-client-credits.md). Extends [client billing](CLIENT-BILLING-WORKFLOW.md); supplier credits remain separate future work.

## Correct an issued invoice

In Costs → Client billing, open an issued invoice and choose **Create credit note**. Enter a unique credit reference, date, client-facing reason, positive net and tax credit. The draft defaults to the original amount not yet credited. Tax-only credits are supported. Net and tax each cannot exceed the original amount left after issued credits; draft credits do not reserve or alter balances.

Preview the credit PDF, then confirm issue. The credit names the original invoice and uses its frozen client identity, address and project/currency context. It cannot change the original invoice or bank details. Issuing freezes the credit and files its PDF into Client Invoices → **06 Client invoices** for mapped new projects. It does not send email, change an estimate or return money.

For an incorrect invoice that needs replacing, fully credit its remaining net and tax. **Create replacement draft** then copies the invoice to a new reference with a link to the original. Review client details, description, amounts, dates and payment instructions before issuing. One active replacement per original prevents accidental duplicate corrections; a void replacement draft can be replaced. The normal approved-estimate billing cap still applies.

Original invoices and issued credits remain immutable. Draft credits can be edited or voided. Issued credit notes cannot themselves be voided or credited in this version; additional correcting charges require a reviewed invoice. If the agreed project price changes, record a revised estimate approval—the credit does not rewrite the commercial agreement.

## Balances and money returned

Billed net = issued invoice net less issued credits. The approved net left to bill uses that adjusted billed amount. Credits never become negative supplier costs.

An invoice's balance = original gross − issued credit gross − active receipts + active refunds. Client balance and overdue totals sum positive invoice balances; refund due sums negative balances separately. A paid invoice's credit therefore remains visible even if another invoice or replacement is unpaid. There is no automatic transfer of receipts or credits between invoices.

Use **Record refund** on the original invoice after money has actually been returned. Enter the bank date, amount and reference. Partial refunds are supported; refunds cannot exceed the amount owed back. The app records the entry but does not initiate a bank transfer. History distinguishes receipts from refunds. Corrections reverse entries with reasons; reversing a receipt is blocked if it would leave more refunded than received, so incorrect refund entries must be corrected first.

## Integrity and document recovery

All actions share per-project serialization, request retry deduplication, record versions and audit history. Invoice and credit references share one unique namespace. Credit issue rechecks remaining original net/tax under the lock, including concurrent competing drafts. Cross-project corrections, credits of credits and future issue/payment dates are rejected.

The existing durable client-document queue handles credit PDFs. Unique source keys recover filing retries and crashes without duplicate app documents. Issued invoice/credit files are protected from app deletion, moving or renaming, including local staging. Drive permissions are unchanged; this does not prevent a Drive user from changing files outside the app.

## Validation and limits

The integration test applies the actual additive migration over a populated previous client register and checks original invoices and receipts survive. It covers partial/full/tax-only credits, over-credit and concurrent issue guards, replacement linkage, paid credits, partial refunds/reversals, separate receivable/refund totals, unchanged estimates/supplier costs and protected private-safe EUR PDFs with retry recovery. Browser tests cover credit creation → issue → PDF → refund → full credit → replacement draft, desktop/mobile and runtime checks.

Tests use isolated schemas and files, never real client financial records or Drive publishing. First-project live acceptance remains outstanding. No supplier credits, FX, bank sync, cross-invoice cash transfers, automatic email or complete financial-close workflow is claimed.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.
