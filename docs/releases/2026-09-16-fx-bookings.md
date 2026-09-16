# Supplier currencies and linked crew bookings — 16 September 2026

Status: deployed and live-verified at 2026-09-16T16:14:07.843Z.

User authorised continuing the agreed finance, Drive evidence, crew and scheduling plan autonomously, including deployment. [Workflow and limits](../production-hub/FX-AND-BOOKINGS.md).

## Delivered behaviour

- Original supplier currencies, reviewed rate/date/source and base amounts from planned estimate rates and quoted costs through supplier POs, invoices and credits. Client prices and frozen approvals retain their existing base currency.
- Actual bank settlement and fees, source/base balances, partial payments, refunds, reversals and residual rounding. Realised exchange differences and fees affect the project forecast; original documents stay identifiable.
- A clearer six-card cost overview, separate bank/FX/refund detail and direct quote/invoice/PO evidence links.
- Crew bookings reuse a person and planned cost, link selected project dates, distinguish options from commitments and retain released history. Schedule shows booked people per date. Existing options sync skips financially linked crew; legacy edits cannot overwrite their financial fields.
- Additive migration `20260916200000_fx_and_booking_links`; no live financial records are converted or populated.

## Validation

The dedicated isolated integration test applies the actual migration over old invoice/payment fixtures and checks EUR valuation, original-currency caps, same-rate credits, partial settlement, refunds, bank fees, reversals, source-penny rounding, forecast/summary agreement and immutable approvals. It verifies booking retry deduplication, reused allowance, stale update rejection, project date membership, release and cancelled-date flags. Browser tests cover EUR cost and invoice entry, actual bank payment, confirmed booking and desktop/mobile schedule display.

Regression evidence: supplier reconciliation and credit browser/API suite; new-project estimate/Drive suite; client-credit suite; supplier finance suite; PO suite; Drive queue/OAuth suite. The PO test's historical-schema transformation now preserves later independent currency/booking columns and adds the later PO source-amount column after its target migration. Full lint has no errors and one pre-existing SelectsPortal hook warning. Schema/build and documentation verification recorded below after completion.

## Limits

Rates are reviewed inputs, not automatically fetched market rates. No bank transfer, bank feed, tax advice, automatic VAT treatment, revaluation of open balances, cross-invoice settlement or formal financial close. Each selected booking date is one charged day; fractional/overnight charging and cross-project time clashes need later work. Active PO changes still require the existing cancellation/review workflow; formal amendments are not part of this release. No real Hair Lab price, approval, payment or booking is entered by testing.

## Deployment evidence

- Release `20260916T161011Z`, published 2026-09-16T16:14:07.843Z. [Source manifest](2026-09-16-fx-source-manifest.json): 219 source/configuration files; SHA-256 `fb3297a9217a1c491fb457d18d6f9af1672936d979b08e7fa77aa68894587b89`.
- Applied only `20260916200000_fx_and_booking_links`; all 79 migrations applied. Schema validation, backend/frontend builds and nginx validation passed. API readiness verified before static publication; previous assets retained.
- Verified private backup: `/srv/backups/production-management-system/20260916T161011Z-fx-bookings`. Custom database dump, served frontend, source/disk build snapshot, private environment/config and hashes; existing uploaded assets retained in place, not copied. Disk backup may differ from older code already loaded in PM2. Rollback must retain the new schema and use currency-aware code once foreign records exist.
- [Live checks](2026-09-16-fx-live-check.json): authenticated finance/workspace/bookings/reconciliation APIs, Drive connected, estimate and EUR invoice editors, crew and schedule, mobile width, no browser runtime errors, authentication enforcement and temporary-session cleanup. Legacy options sync was intercepted during read-only browser verification.
- Production financial counts remained unchanged during verification: {"costs":0,"invoices":0,"payments":0,"clientInvoices":0,"approvals":0,"bookings":0}. Hair Lab remains a GBP unpriced draft. Its internal instructions were updated to explain the new EUR workflow; line IDs, prices, quantities and currencies were checked unchanged. No real supplier quote, rate, booking, invoice, approval or payment was entered.
- Dedicated API/browser tests also verify saving foreign currency on an unpriced row without turning it into a zero-priced allowance, revising an EUR planned rate without changing the prior approval, and source-penny final settlements. Regression suites and full lint passed (one existing SelectsPortal hook warning). Documentation checks preserve all 33 archived originals.

## Next operational use

Use the currency button in Estimate for reviewed EUR planned rates; Live costs for supplier quote links; Invoices for original EUR documents and actual GBP bank settlement. Crew List → Add booking reuses a planned cost and project dates; Schedule → Manage shoot dates maintains those dates. Real supplier agreements and bank evidence are still needed before financial close. No next-step confirmation is required to continue authorised engineering work.
