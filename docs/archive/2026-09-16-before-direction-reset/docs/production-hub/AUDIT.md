# Production hub audit evidence

Captured 16 September 2026. Companion to [the consolidation plan](PLAN.md). Scope: repository inspection, read-only database measurements, selected Google Sheets ranges, two standalone Apps Script files and extracted text from sample published PDFs. No live sheet or database records were changed. This is not a complete accounting audit or a review of every bound script.

## 1. Performance: measured, not yet fixed

The project-list query includes dates, crew, budget sections/lines/subcosts, files, email threads and full email messages. Nine project records serialize to **49,498,645 bytes**. Three local reads took 1,106–1,259 ms for the query and another 209–311 ms for serialization, with 20 SQL queries per read.

A proposed basic summary projection returned the same nine projects in **1,981 bytes**, with two queries taking 5–9 ms. This projection excludes financial aggregation. It is a diagnostic comparison, not a shipped endpoint or an end-to-end speed claim. HTTP overhead, compression, browser rendering and production latency percentiles were not measured.

Method: Prisma reads inside a transaction marked `SET TRANSACTION READ ONLY`, with a 15-second statement timeout. The current include shape was taken from the route source without importing the server or starting its background jobs. Aggregate measurements contain no project or message content: [performance-baseline.json](performance-baseline.json).

Relevant code:

- `backend/src/routes/productions.ts`: `productionInclude` and project-list route load the broad object graph.
- `frontend/src/pages/Productions.tsx`: list loading depends on selection/search parameters; switching project context can repeat the broad request.
- `frontend/src/pages/Home.tsx`, `Actions.tsx` and `components/CommandMenu.tsx`: the earlier interface cleanup still relies on this endpoint.
- `backend/src/routes/productionWorkbooks.ts`: GET calls bootstrap, which performs source-row upserts and reads the workbook; the route reads it again. Opening a view therefore causes writes and duplicate work.

## 2. Finance: structural findings

`backend/src/services/budgetService.ts` calculates actual cost by summing subcost amounts. It does not distinguish a purchase commitment from a bill by status/type at that point. Whether individual existing records double count depends on how they were entered; the audit does not establish an existing loss.

The `SubCost` model in `backend/prisma/schema.prisma` combines commitments, receipt/invoice metadata, amount/currency and payment flags. There is no independent supplier-invoice header, invoice allocation and payment-allocation ledger. `cloneRevisionForEdit` copies subcosts, including invoice/payment metadata, into an estimate revision. The locked-revision editing path can therefore couple operational cost changes to commercial estimate versioning.

Project-summary totals and budget-service totals use different formulas: some visibility, sub-item and fee-enabled rules differ. A read-only comparison of **11 current budgets found zero quote-total and zero actual-total mismatches** on this dataset. This is a latent consistency risk, not proof that current displayed totals are wrong. See [finance-consistency-baseline.json](finance-consistency-baseline.json). Neither formula was independently reconciled to approved estimates, invoices or bank records.

Further load amplification: budget decoration rereads revision detail; revision history calculates totals per revision; edits return broad revision payloads. These should be measured and reduced when building the finance slice.

## 3. Overlapping record ownership

The workbook keeps generic rows alongside domain records. Source-linked rows are upserted when the workbook opens, including title, status, notes and JSON data. The generic row-edit path does not consistently write those fields back to the source entity; project actions are one example. Static code inspection indicates that edits can be replaced by a later bootstrap. This was not reproduced with live writes.

Migration must inventory manual-only workbook content before consolidation. Deleting workbook rows or replacing the interface without that inventory could discard information.

## 4. Status-sheet references

These are workflow references, not automatically approved import sources. Sample ranges were inspected after spreadsheet metadata, rather than assuming tab names or reading entire workbooks. Private travel and identity details are intentionally omitted here.

| Source | Observed workflow and data-quality issues |
| --- | --- |
| [2657 · Hair Lab · STATUS](https://docs.google.com/spreadsheets/d/1jRPmkIpt1EUPzK48I75UyxKz5okxcxDjcePX86JS_7o/edit) | Seventeen tabs cover setup, actions, schedule, people, date-specific holds, casting, locations, travel, hotels, kit, catering, costs, post and close. Setup `C7:C12` contains values inconsistent with adjacent labels, including a person's name under estimate status. Dashboard propagates setup values. Casting row 6 contains a candidate where a header is expected, and validation no longer matches some entered status values. Template/example entries remain. |
| [Status Doc — GANNI D3](https://docs.google.com/spreadsheets/d/1ELmkMR90RNrBy91gKLbUKtjKdwbm86MxJCz9OGt174A/edit) | Artist options and casting use per-date availability; crew attendance feeds logistics and catering. Hotel, travel and two car views express related journeys. Fees mix numbers and free text. TO DO includes external task IDs and update timestamps. These relationships should survive consolidation. |
| [Status Doc — Nicky Hilton x Theo Grace](https://docs.google.com/spreadsheets/d/1twYfLfdGO68pCBUD-qxMp59FWXjiwKRanHezL2aDM28/edit) | A lighter ten-tab project supports configurable modules. Filename job number 2433 conflicts with internal dashboard identity 2343U (`B9`/`G14`). Do not merge projects using names or filenames alone. |

Hair Lab dashboard cells `H26:I26` report open/overdue work while the message at `B30` says nothing is overdue or due soon. Formula/range/date handling needs a focused verification before reproducing those indicators. The cause was not established.

## 5. Finance-sheet references

| Source | Observed evidence and implication |
| --- | --- |
| [2657_Estimate_V1](https://docs.google.com/spreadsheets/d/12YosxcUQH-iVOSJDUMaF7updprbgE5G51-E7oiMpk94/edit) | Detailed estimate combines client pricing, internal estimate, actuals, variance, P&L and invoice fields. Header instructions rely on hiding internal columns before a client PDF. Replace that dependence with an explicit client-export field allowlist. Internal summary `C9:D15`/`F9:F15` includes broken references; much of this workbook is template content. |
| [2645 YVES26 — Estimate V1](https://docs.google.com/spreadsheets/d/1uAz8wBmzTsSTEXck-MMXzA9Tviu4BtTIcvJn1_7QJbE/edit) | Contains populated estimate lines, but internal summary includes broken references and `E15` displays 2260667.85% margin. Detail and summary show different currency formatting; the intended conversion basis needs confirmation. These summary figures cannot serve as an unquestioned migration baseline. |
| [Unlimited_Bond_Controller_Pack](https://docs.google.com/spreadsheets/d/1J4pQQ7NDkGki9nqZCYw95junpvzzkX50Se5dQIqGA70/edit) | Useful design intent: linked estimate/recon rows, invoice/file records and menu-driven publishing. Sample rows and example folder URLs are not production records. README describes expected functions, not inspected executable code. |

Pilot reconciliation should use an approved client estimate, supplier source invoices, credits, payment evidence and a producer-approved closing position. A broken spreadsheet summary is not financial ground truth.

## 6. Apps Script and publishing coverage

Read the standalone [StatusDoc_AppsScript.js](https://drive.google.com/file/d/1Podi1oxT8NFcnb85IsI0wB4XVI_WukqF/view) and [Budget_AppsScript.js](https://drive.google.com/file/d/1BqDcxlWN6TndVAdVU1mZtLBUET8Sm9LK/view) in the [apps-scripts folder](https://drive.google.com/drive/folders/1pHkOFf1p82WSSAjVlY8_IRfB5MFZOtNK). Both are January 2026 files. They were decoded for source inspection, not executed.

- Status script contains contact lookup and fixed-column crew insertion. Its casting-PDF function is a setup alert and its full sync is a TODO. Query handling encodes the entire endpoint string, including query parameters, which warrants correction if this version is used.
- Budget script writes an invoice amount into an actual-cost cell and stores related metadata in notes. Paid state is also note-based. Estimate versions copy the spreadsheet. Some sync functions are placeholders/logging.
- These are **not established as the working casting/location generators the user described**. Do not remove or replace those working scripts on this evidence.

Inspected extracted text from a [casting V8 PDF](https://drive.google.com/file/d/1Xt0KPT1n2m_4pw9G8qXoEjhNR_YKk57u/view) and [location V6 PDF](https://drive.google.com/file/d/1mPYI8KfherVfeGdgKg8arxXXpmMToFBi/view). They show the useful publishing contract: selection, images/links, agent or venue details, date-specific holds, notes, version and timestamp. Extraction also contains template tokens; visual rendering needs inspection before calling these a visible export defect.

Google documents that [container-bound scripts do not appear in Drive](https://developers.google.com/apps-script/guides/bound) and [cannot be accessed through the Drive API](https://developers.google.com/apps-script/guides/import-export). The available connector does not expose Apps Script `projects.getContent`. Complete review therefore needs source from Extensions → Apps Script: the `.gs` files, any `.html` files and `appsscript.json`, excluding secrets. Editor links help identify projects but are not a guarantee that this connector can retrieve their code.

For each working automation, capture its menu/trigger, input tabs and columns, templates, output fields, destination, audience, version naming and known exceptions. Validate replacement PDFs against those examples before switching off a script. Existing app PDF services should be assessed for reuse, not discarded.

## 7. Architecture references and decisions

The [Drive master specification](https://drive.google.com/file/d/1dQgimY2BJjhSJEP6TYBQ32IvNvIUCLH6/view) supports a database as record authority, Drive for files, optional Sheets views, production gates, global people, published snapshots and later AI/integrations. It names VPS/Postgres, whereas the original pasted proposal names Next.js/Supabase. Those are different platform directions.

The plan recommends fixing the oversized reads and finance ownership in the current stack first. It does not silently resolve the larger hosting/authentication/platform decision. Existing single-team authentication, mixed ID formats and local asset storage also mean that full project-level access controls and Drive-backed file handling remain separate implementation work.

## 8. What this audit delivered

A source-grounded consolidation plan and aggregate benchmark artifacts. No performance improvement, financial migration, Drive write, automation replacement or deployment is claimed. The first implementation milestone is a slim project-summary read path with on-demand detail and a measured browser check; the next is the finance ledger and a reconciled pilot project.
