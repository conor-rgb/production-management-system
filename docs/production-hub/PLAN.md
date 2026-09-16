# Unlimited.Bond production hub: consolidation plan

Prepared 16 September 2026. Status: current direction, reset and authorised on 16 September 2026. Implementation and deployment outcomes are tracked separately in [the release record](../releases/2026-09-16-production-hub.md); the complete accounting/close model remains partly planned.

Implementation update: the workspace index, finance navigation and Drive file/export foundation are now implemented in source. See [implementation and activation notes](DRIVE-IMPLEMENTATION.md) for verified scope and remaining work. The independent supplier register now implements costs, invoices, allocations, partial payments and exception views for a pilot. See [finance implementation](FINANCE-IMPLEMENTATION.md); migration, credits, FX, client receivables and full close below remain planned.

New-project update: the user prefers starting fresh. [Starter estimates, recorded approvals, planned-cost handoff and mapped Drive folders](NEW-PROJECT-WORKFLOW.md) now provide the first complete new-job supplier-finance path. Legacy migration is no longer a prerequisite. The subsequent [PO workflow](PURCHASE-ORDER-WORKFLOW.md) adds supplier commitments/documents and invoice matching. Module configuration, credits/FX and formal close below remain future work.

The immediate priority, confirmed by Conor, is **budgets, invoices and reconciliation**. Build a fast project workspace with a reliable financial ledger, then connect the rest of the production lifecycle to it. Preserve spreadsheet speed and useful existing production tools.

## 1. The product decision

Every project needs one working home, one set of operational records, one financial ledger and one publishing path. The current app combines several versions of that idea. Adding another dashboard without removing duplicate ownership will keep the confusion.

Use the status sheets to understand production behaviour: day-by-day options, booking decisions, movement legs, dietary headcounts, client review, money and final close. Do not turn every sheet tab into an independent app database.

The released foundation uses a slim summary endpoint for Home, Actions, command search, project index and Files. Project thread previews no longer fetch full message bodies. Other heavy budget/workbook paths still need the work below.

## 2. What the producer sees

Global navigation:

**Home · Projects · People · Finance · Files**

Home contains Needs You, upcoming production dates and active jobs. Actions remain accessible from Home and inside each project. Finance provides the cross-project invoice queue, upcoming supplier payments, missing invoices and client balances. Gmail, calendar connections, templates and administration sit under tools/settings; project-linked communication remains accessible from a record.

Project navigation:

**Overview · Actions · People · Casting · Crew · Schedule · Travel · Locations · Costs · Deliverables · Files**

Enable modules by project template. A Paris shoot exposes Travel; a local studio job can omit it. Only enabled modules appear. Overview answers what, when, where, who is confirmed, what is blocked and what changed. It includes a compact financial position with drill-through to the underlying costs.

Keep three consistent interaction patterns:

- A table for fast work: inline edits, paste, range selection, keyboard navigation, undo and saved views.
- A side drawer for a person, booking, cost or invoice without losing the current table/filter/scroll position.
- A deliberate Preview → Publish flow for anything issued to client, crew or supplier.

One shared table component should own those behaviours. Domain columns and validation remain specific to casting, crew, costs and travel. Avoid a universal JSON spreadsheet that becomes a second source of truth.

## 3. Finance first: four connected views

Inside a project's **Costs** module:

| View | Question it answers | Main work |
| --- | --- | --- |
| Estimate | What did we offer and what did the client approve? | Build, compare revisions, approve, publish client PDF |
| Live costs | What have we committed and what will this job cost? | Supplier commitments, booking links, forecast, changes |
| Invoices | What arrived, what does it match, what needs review? | Preview document, extract, allocate, approve, record payments |
| Reconcile | What remains unresolved before this job closes? | Missing invoices, unmatched amounts, credits, unpaid balances, final margin |

The main live-cost table should show:

`Code | Description | Supplier | Approved client amount | Internal allowance | Committed | Invoiced | Paid | Forecast final cost | Margin | Exception`

Save narrower views such as Unmatched invoices, Missing supplier invoices, Over commitment, Payment due, Foreign currency and Ready to close. Do not show all financial fields and flags in every view.

### Separate estimate snapshots from operational money

An approved estimate is a fixed commercial baseline. Supplier costs, invoices and payments continue moving after approval. Receiving an invoice or marking a payment must not create another estimate revision or duplicate supplier commitments.

Use stable project cost IDs across estimate versions. Estimate lines reference those IDs where applicable; an estimate-only line can acquire a cost record later. Revisions snapshot client-facing descriptions, quantities, prices, fee rules, assumptions, usage, payment terms and totals. A change to the agreed client scope creates a new revision/change order; a supplier bill does not.

An invoice has its own identity, supplier, number, dates, original currency, net/tax/gross amounts and Drive file. An invoice can cover several cost lines, and a cost can receive several invoices. Payments and credit notes are separate records with allocations. A paid checkbox may be a shortcut for recording a payment, but it must not be the payment ledger itself.

### A normal invoice journey

1. A PDF enters the project's Drive folder or an explicitly selected email attachment is filed there.
2. The app creates a draft invoice linked to its Drive file and source; repeat ingestion is idempotent.
3. Extraction proposes supplier, invoice number/date, due date, currency, totals and line items. Show uncertain fields and the source document together.
4. Match candidates use project, supplier identity, PO reference, currency and remaining commitment. Matching amounts are evidence, not approval.
5. Review allocations and differences. Resolve an overage by accepting an internal cost increase, requesting correction, or proposing a client change. Moving an internal allowance does not mean the client approved an overage.
6. Approving records the invoice and allocations once. This is distinct from authorising or executing a bank payment.
7. Record payments with amount, date and reference; support partial settlement. Show the outstanding gross balance separately from net project cost.
8. Reconciliation highlights remaining invoices, unbilled commitments, credits and delivery/usage conditions before close.

### Financial meaning must be explicit

Use decimal amounts or currency minor units with explicit rounding rules. Store original currency and the conversion basis used for each commitment/invoice/payment. Do not add raw GBP and EUR amounts together. Missing FX or missing costs should show an unresolved forecast, not zero.

Proposed management views, subject to validation against a reconciled reference job:

- **Approved revenue:** accepted client estimate plus approved change orders on a consistent net basis.
- **Forecast final cost:** recognised net costs + remaining cost to complete. Remaining cost must exclude amounts already represented by recognised invoices; it includes unbilled work and uncommitted forecast work.
- **Forecast margin:** approved revenue − forecast final cost, using the same currency and cost basis.
- **Supplier balance:** approved invoice gross − allocated credits/payments, on the settlement basis.
- **Client balance:** issued client invoice gross − allocated receipts/credits. This is separate from supplier balance and margin.

Example for software acceptance, not a real job: a £1,000 net commitment receives a £600 net invoice and still has £400 net work to complete. The forecast remains £1,000, not £1,600. A later £400 net invoice consumes the remaining commitment; two part-payments settle the invoice without changing the forecast or duplicating costs.

Maintain separate statuses for commitment, invoice review, allocation and payment. One long status sequence cannot represent an invoice that is partly paid, partly disputed and allocated across two costs.

## 4. From enquiry to close

Project phases should be configuration with project-specific requirements, owners, due dates and evidence links. Preserve enquiry/estimate history when the project is greenlit. A phase is not simply a percentage of checked tasks.

| Phase | Completion evidence | What the system helps prepare |
| --- | --- | --- |
| Enquiry / estimate | Brief, scope, provisional dates, estimate versions | Project record and proposed resources |
| Greenlight | Approved commercial scope, PO/contract/insurance requirements resolved | Drive root, project defaults, approved financial baseline |
| Book | Crew/talent/location commitments, holds and terms resolved | Deal memos/PO drafts, live commitments |
| Prep | Schedule, recce/fitting where needed, PPM approval | Readiness exceptions and document previews |
| Move | Travel, hotel and ground movements complete for required travellers | Itinerary and movement-order previews |
| Shoot | Current call sheet issued; actual hours/changes/expenses captured | Operational updates linked to costs |
| Wrap | Kit returned, locations released, physical production closed | Outstanding supplier invoice requests |
| Post / delivery | Assets and deliverables approved/delivered, usage evidence recorded | Delivery record and remaining work |
| Close | Costs reconciled, relevant invoices/payments resolved, debrief/archive complete | Final report and reusable history |

Do not equate physical wrap with financial close. Allow a producer to advance a phase with a recorded exception where appropriate; show the outstanding requirement until it is resolved or explicitly waived. Payments may remain open while delivery is complete.

## 5. Reuse data instead of copying it

| Concept | Owns permanent information | Owns project-specific information |
| --- | --- | --- |
| Person / organisation | Identity, representation, contacts, portfolio | Role, dates, option rank, agreed terms, project notes |
| Location | Address, features, access, contact, reference imagery | Dates, hold expiry, rates, recce/contract state |
| Cost | Stable project cost identity, supplier links | Forecast, commitment changes, allocations and evidence |
| Travel | Linked traveller identity | Ordered dated legs with timezone, booking and cost links |
| Hotel | Reusable property/contact | Guest stay, check-in/out, room/rate and confirmation |
| Document | Template and renderer | Source snapshot, version, audience, Drive ID, publication record |

Confirming a candidate should create/update one booking for the appropriate role and dates. Its cost links to the live ledger. The crew list becomes a view of bookings, not a second manually maintained person list. A traveller appears in a travel grid and individual itinerary through the same legs. Catering derives from actual attendance and dietary requirements, with manual exceptions recorded.

Keep identities distinct from names. Imports preserve source workbook/tab/row and original job code. The reviewed Nicky sheet's title and embedded job code differ; those values must be resolved before automatic project matching.

## 6. Make the app fast before expanding it

The read-only benchmark is in `performance-baseline.json`. The existing list query returned nine projects as **49,498,645 bytes**, with 20 SQL queries per run. It took 1.11–1.26 seconds to read/materialise and 0.21–0.31 seconds to stringify locally. This excludes HTTP transfer, browser parsing/rendering and endpoint financial decoration.

A proposed summary projection of those same nine projects returned **1,981 bytes**, with two queries and 5–9 ms local query time. It intentionally omits financial aggregation and is not a shipped replacement.

First engineering changes:

1. Create typed, bounded project summaries and lightweight picker/search results. No email bodies, full budgets or full crew records in those responses. Rewire Home, Projects, Actions and command search.
2. Fetch a project header/overview once, then fetch only the open module. Fetch message bodies when the user opens a thread.
3. Remove list refetches caused solely by tab/query-string changes; debounce text search and cancel stale requests.
4. Make workbook GET read-only. Move bootstrap/import/materialisation into explicit migration/setup jobs. Stop sequential per-row upserts on ordinary page loads.
5. Remove redundant budget revision reads and the per-revision totals read loop. Load history/templates on demand and return changed rows plus affected totals for routine edits.
6. Cache module queries and invalidate only affected records. Keep local edits responsive; surface failed saves and concurrency conflicts.
7. Lazy-load heavy budget/options/workbook/editor modules. Render only visible rows for large grids. Keep PDF rendering, extraction and Google sync in durable background jobs with progress/retry state.

Proposed acceptance targets: warm project summary API p95 below 250 ms; first useful project view within 1.5 seconds on the agreed representative connection; visible cell response below 100 ms; usual save acknowledgement below 500 ms. These are targets to measure, not results already achieved. Test with representative large historical jobs and at least 500 cost rows, not only the nine current projects.

## 7. Keep the useful work already built

Retain and simplify the existing Blackbook/person relationships, date-based options, budget line editing, revision concepts, supplier onboarding, receipt/travel extraction, PDF branding/templates, itinerary records and selects/delivery workflow. Verify each against real examples before claiming full parity.

Consolidate the overlapping Overview/Status Doc/Workbook surfaces. Source-linked workbook rows should be projections/adapters; edits must update the owning entity. Retire duplicate editors only after the new path covers their unique data. Manual workbook-only rows require an explicit migration destination.

Keep PostgreSQL as operational truth and Drive as file truth. The direction reset resolves the earlier platform conflict: retain React/Vite, Express, Prisma and PostgreSQL on the current VPS. No Next.js/Supabase migration is scheduled. Existing session auth remains; team/project permissions require separate implementation. Changing frameworks alone will not fix financial ownership problems.

Use UUIDs for new domain records; retain existing IDs or explicit mapping tables for migrated records and URLs. Implement team/project permissions as part of the integration foundation. Do not mistake the assistant's connected Drive for the app's own Google authorisation.

## 8. Publishing and existing Apps Script

The reviewed casting and location PDF outputs show valuable features: images, agency/contact context, per-date options, location specifications, links, versioned names and timestamps. Preserve this publishing behaviour. The working bound-script source has not yet been inspected; only two older exported `.js` files were readable.

Build a document service around structured input, versioned templates, preview and Drive publication. Preserve a sent snapshot separately from an editable working deck. Store selected record IDs, source version/hash, audience, template version and output Drive IDs. Refresh should respect manual editorial content in editable Docs/Slides rather than overwriting arbitrary content.

Client exports must use an explicit field allowlist. Internal costs, margins and internal notes should never be included merely because a user forgot to hide columns. Validate missing images, unresolved template tokens, missing required fields and output audience before publication. The extracted text of sampled PDFs includes template tokens; visual parity checks should determine whether these are visible template pages or extraction artefacts.

Do not discard working generators until their inputs, template dependencies, triggers, destinations and output parity have been documented.

## 9. Build sequence and release gates

| Order | Deliverable | Ready when |
| --- | --- | --- |
| 1 | Performance foundation | Summary/picker endpoints adopted; no full inbox on project load; ordinary reads cause no workbook writes; measured before/after results |
| 2 | Financial foundation | Stable costs, immutable client estimates, invoice/payment allocations and a shared calculation service; old records mapped without double counting |
| 3 | Finance workspace pilot | One completed job reconciles to accepted source documents; one live job runs estimate → costs → invoices → payments without duplicate entry |
| 4 | Project workspace consolidation | One authoritative path for actions, requirements, bookings and dates; legacy manual rows preserved/migrated |
| 5 | Drive and publishing | App-owned Google connection, project roots, retryable metadata sync, approved document previews and verified Drive outputs |
| 6 | Logistics through close | Travel/hotel/call-sheet data reuse, delivery evidence and clear physical/financial close requirements |
| 7 | Structured AI assistance | Suggested extraction, matching, chasers and risk flags with source evidence and explicit acceptance |

The UI/read and Drive foundation has been implemented ahead of the financial rewrite at the user’s request; the table above describes remaining acceptance gates, not a claim that each row is complete. Live Drive consent/publishing still needs a pilot.

Drive authorisation/indexing can be prepared alongside financial modelling. It must be working before the pilot relies on automatic filing; reviewed existing files can initially be linked by verified Drive ID. Do not block the first payload fix on a complete integration migration.

Use a completed job with a producer-confirmed final reconciliation as the finance acceptance case. The inspected YVES26 workbook has broken summary references, so its summary totals are not an accepted baseline. Hair Lab is a good live production workflow case after its mapping issues are resolved.

Migrate in additive stages: backup and restore rehearsal; dry-run mappings and exception report; one-project pilot; reconcile counts/totals/files; cut over one owning workflow; retain read-only legacy access; then retire its duplicate editor. Avoid long-lived dual writes and silent name-based deduplication.

## 10. Financial release checks

Before a pilot is called usable:

- An invoice/payment update leaves the approved client estimate unchanged.
- Reloading, retrying and repeated imports cannot duplicate an invoice or payment.
- One invoice can allocate to several costs; one cost can accept several invoices and credits.
- Partial payment leaves the correct balance; evidence is retained.
- Commitments and corresponding invoices are not counted twice in forecast.
- Foreign-currency amounts retain original values and applied FX basis; missing rates are visible.
- All screens and exported reports agree on totals; hidden UI rows cannot hide real costs.
- Concurrent edits produce a visible conflict or safe merge, not silent lost updates.
- Draft extraction and unapproved matches cannot silently alter actuals.
- Client PDF export excludes internal financial fields by construction.
- The producer can identify every unresolved close item and follow it to a document or record.

Next implementation target: **validate a real French Hair Lab commitment/invoice in the deployed supplier register, then connect existing POs/receipts and reviewed legacy migration.** Drive consent/root access is verified; a live document publishing pilot remains outstanding. The summary/read and Drive foundation are implemented; ordinary workbook reads and financial ownership still need consolidation.

## Working from Drive — scope clarification

The user means editing presentations and project documents in Google editors, not two-way budget/status Sheet cells. Use one native working-file ID from both interfaces. Preserve issued PDFs as separate snapshots. [The document workflow](DRIVE-WORKFLOW.md) records current behaviour, verified connection, mismatched job codes and planned mapping of existing project folders. Google consent/root access is now verified; link the correct pilot project before publishing.

## Client billing extension — 16 September 2026

[Client billing and receipts](CLIENT-BILLING-WORKFLOW.md) now covers deposit/progress/final invoice drafts, protected issued PDFs in Drive, the approved net left to bill and partial receipts/reversals. Issuing does not send email. Credits, FX, banking sync and formal financial close remain outstanding. Check its release record for deployment state.

## Client credits extension — 16 September 2026

[Client credits and corrections](CLIENT-CREDIT-WORKFLOW.md) implements client invoice credits, linked replacements and recorded refunds. Earlier outstanding-credit references now apply to supplier credits and remaining settlement workflows. FX, banking sync and formal financial close remain outstanding. Check the credit release record for deployment state.

## Supplier reconciliation extension — 16 September 2026

[Supplier credits and reconciliation](SUPPLIER-RECONCILIATION.md) supersedes earlier outstanding-supplier-credit references. Supplier credit/refund records, source-aware final-review checks and a combined financial overview are implemented. FX, automatic bank/accounting sync, formal PO amendments and formal financial-close sign-off remain outstanding. Check its release record for deployment evidence.

## Supplier currencies and bookings extension — 16 September 2026

[Supplier currencies and linked bookings](FX-AND-BOOKINGS.md) supersedes earlier outstanding-FX references for reviewed original supplier amounts, conversion and actual settlement differences. Crew bookings now connect project dates to one supplier cost. Automatic market-rate retrieval, bank feeds, formal PO amendments and formal financial close remain outstanding. See the latest release evidence for deployment state.
