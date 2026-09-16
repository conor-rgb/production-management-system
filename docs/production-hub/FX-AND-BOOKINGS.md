# Supplier currencies and linked production bookings

Deployed and live-verified 2026-09-16T16:14:07.843Z; [release evidence](../releases/2026-09-16-fx-bookings.md). Extends the existing finance ledger without converting old records or changing approved estimates.

## Currency ownership

Client estimates and billing use the project base currency. Supplier quotes, planned estimate rates, POs and invoice/credit documents can use GBP, EUR, USD, CHF, CAD or AUD. A foreign amount retains its source currency, original net/tax, reviewed rate, rate date and rate source. Rates mean **base currency per one source unit**, with up to six decimals; no live market rate is fetched or inferred. Conversion uses integer arithmetic and rounds half up to base-currency cents.

In Estimate, the currency button on each row opens supplier-rate details. The planned-rate cell then uses that supplier currency, while client rates remain in the project currency. An approved snapshot retains source evidence. Planned source amounts are multiplied by quantity/days before the total is converted. Later invoices and settlement do not rewrite the approved snapshot.

In Live costs, enter the original supplier amount and reviewed rate and attach a Google Drive quote link. The table shows original and base amounts, with direct links to the quote, allocated invoices/credits and the PO. Remaining-work overrides remain in the project currency. A linked crew booking or active PO controls the commitment; edit its owning workflow instead of changing the live cost independently.

POs require one supplier currency; selected costs may retain different reviewed rates. Supplier PDFs show original agreed amounts in supplier currency; the ledger retains each line's converted base cost. An issued PDF remains immutable. Formal amendments remain future work; existing cancellation guards apply.

Invoice review accepts original net/tax and conversion evidence. Allocations and PO variance checks are in the base currency. Foreign credits must match the original invoice currency and use its original valuation, with separate original-currency net/tax caps. Credit rounding leaves no spurious original balance on a full credit. Credits reduce actual cost without reopening the original unbilled allowance.

## Cash and forecast

A payment/refund records original currency settled, actual bank amount in project currency excluding fees, fee, date and reference. It does not move money. The invoice's historical base value is settled separately from the actual bank amount. The last settlement absorbs the remaining base rounding amount; sub-cent-valued foreign settlements still retain source evidence and can close the source balance. Reversals preserve history and restore both balances. Duplicate retries and competing writes use the existing operation and project-lock controls.

Project forecast = net invoice allocations less credits + remaining work + realised exchange differences + bank fees. Positive FX differences increase cost; refunds reverse the direction. Bank spend includes invoice tax, unlike net supplier cost; both are labelled separately. No VAT recovery decision, bank feed, automatic revaluation of unpaid balances or cross-invoice netting is implied.

## Bookings and schedule

Crew List and Schedule now expose linked bookings. Select an existing crew member or create a person, choose project dates, supplier/payee, role, rate/currency and option/confirmed status. Reuse an existing unlinked allowance to avoid duplicate costs. Each selected date counts as one charged day in this version. Confirmation updates one cost to committed; options stay planned. Release sets remaining work to zero while preserving invoice history. Cancellation charges require their own reviewed cost; a release does not cancel an active PO.

Booking writes check project/date membership, duplicate dates, crew version and updated timestamp, supplier allocation restrictions and active POs. A unique crew-to-cost relation and request IDs prevent retries from creating duplicate people or costs. Old crew edit controls direct linked financial changes to Bookings. Options-to-crew sync skips linked records so it cannot overwrite their financial booking. Existing specialist crew, contact and itinerary tools remain.

Schedule displays who is booked on each project date, including released history, and links to Manage shoot dates. Missing/released dates and status/cost disagreements are flagged; the financial final-review checklist includes these issues. Booking does not send email or automatically confirm a supplier externally. Half-day/overnight charging, time clashes across projects, automatic travel/catering derivation and formal PO amendments remain separate work.

## Verification and rollout

`scripts/tests/fx-bookings-integration.cjs` applies the real additive migration over existing invoice/payment fixtures, checks unchanged legacy defaults and approved estimates, then tests EUR estimates/POs/invoices, original/base balances, partial settlements, fees, credits, refunds, reversal, rounding residuals and finance-summary parity. It tests reused allowances, concurrent/stale booking protection, date validation, release and browser entry through schedule display. Fixtures use a disposable schema; no real prices, approvals, invoices, payments or bookings are created.

The existing estimate, supplier reconciliation, client credit, PO and supplier-register suites remain required regression evidence. Record live checks separately; isolated tests do not prove a real supplier agreement or bank reconciliation.
