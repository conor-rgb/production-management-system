# Changelog

Changes are recorded by behaviour and release, not by assuming Git HEAD matches the deployed working tree. Full older session history is preserved in the [historical handover](docs/archive/2026-09-16-before-direction-reset/HANDOVER.md); the previously deleted [original changelog](docs/archive/2026-09-16-before-direction-reset/previously-deleted/CHANGELOG.md) is also preserved.

## 2026-09-16 — Yves Rocher Hair Lab fresh workspace

User-authorised refresh of existing project 2655, preserving its ID and exact linked Drive folder. Replaced the active unpriced legacy estimate with a fresh GBP motion draft (20 unpriced lines across five sections); previous draft retained in version history and a verified private database/project backup. Scope: one influencer exploring hair science in a Paris lab. No shoot duration, supplier price, exchange rate, fee, approval or payment has been assumed.

Created nine numbered destinations inside the existing project folder and mapped all file categories. Live desktop/mobile checks passed with no browser errors; one explicitly unpriced draft PDF was exported, published to Client estimates and downloaded through Drive successfully. Client PDF scope says it is not a quotation; internal notes are excluded. No invoice, commitment or cash entry created.

This is a live project setup, not a software deployment or completed financial acceptance. GBP invoicing is configured; automatic EUR supplier conversion remains outstanding and must precede foreign-currency invoice entry. Setup and export evidence are retained in the private backup.

## 2026-09-16 — supplier credits and project reconciliation

Deployed and live-verified at 2026-09-16T15:31:28.131Z; all 78 migrations applied. [Release evidence](docs/releases/2026-09-16-supplier-reconciliation.md).

- Unified supplier invoice/credit review from Drive, with original-invoice allocation suggestions, PO matching, duplicate-file protection and pasted-URL recognition.
- Added supplier credit caps, tax-only credits, recorded refunds/reversals and separate refund-due balances. Credits reduce actual cost without automatically restoring unbilled PO allowances.
- Added possible-duplicate and above-PO review notes. Reconcile now combines approved revenue, forecast profit and both sides of settlement, with a final-review checklist and explicit source-file checks.
- Tested a fresh isolated project through estimate, approval, PO, invoice, payment, supplier credit/refund, client billing and reconciliation; no live test financial records or Drive documents created.

## 2026-09-16 — client credit notes and invoice corrections

Deployed and live-verified at 2026-09-16T15:06:06.890Z; all 77 migrations applied. [Release evidence](docs/releases/2026-09-16-client-credits.md).

- Added partial/full/tax-only credit drafts, preview/issue and protected credit PDFs in the project's Drive client-invoice folder. Credits name the original invoice and preserve its issued identity and snapshot.
- Added linked replacement drafts after full credit, with ordinary review and approval-cap checks; original invoices and credits stay fixed.
- Client balances now subtract issued credits and show refund amounts separately. Added partial refund records, duplicate/over-refund protection and corrections that retain payment history. No bank transfer or client email is triggered.
- Reviewed additive migration preserves existing receipt direction and document records. Isolated tests cover competing credits, replacements, refunds, retained estimates, document recovery and desktop/mobile flows.

## 2026-09-16 — client billing, deposits and receipts

Deployed and live-verified at 2026-09-16T14:46:08.746Z; all 76 migrations applied. [Release evidence](docs/releases/2026-09-16-client-billing.md).

- Added Costs → Client billing with deposit/progress/final drafts, PDF preview, confirmed issue and protected Drive-filed invoice snapshots.
- Billing uses the approved net remaining after issued deposits; receipts reduce gross balances without changing costs or approved estimates. Overbilling requires a revised approval.
- Added partial receipts, duplicate/overpayment protection and reasoned reversals with retained history. Finance overview shows client balances and overdue amounts; reconciliation includes client exceptions.
- Client references are unique across the new register. Tax and payment instructions are explicit. No automatic email, bank transfer, credit note, FX or accounting sync is claimed.
- Added migration and isolated API/browser tests for approval caps, concurrent issue, receipt corrections, immutable private-safe documents and document retry recovery. Existing financial records remain unchanged.

## 2026-09-16 — supplier POs connected to live costs

Deployed and live-verified at 2026-09-16T14:25:17.105Z; all 75 migrations applied.

- Protected issued PO files from deletion/move/rename even before Drive publication; PO-controlled cost fields are visibly locked.
- Added a Purchase orders view, draft preview/editing, issue confirmation, immutable supplier-facing snapshots, cancellation reasons and cost reservations.
- Issuing sets the existing costs to agreed commitments; invoices match those same costs without duplicating expense. PO cards and Reconcile show unbilled balances, document failures and overruns.
- Added durable PDF generation into the project's Contracts destination, retry deduplication and Drive publication status. Supplier PDFs respect project currency and exclude internal notes/client pricing.
- Unified numbering for legacy single-line, legacy grouped and live-register POs. Legacy routes cannot mutate finance-managed orders; old records remain accessible.
- [Workflow](docs/production-hub/PURCHASE-ORDER-WORKFLOW.md) · [release evidence](docs/releases/2026-09-16-finance-purchase-orders.md). No supplier emails are sent by these actions. Client receivables, credits/FX and formal amendments remain outstanding.

## 2026-09-16 — new project estimates and Drive workflow

Deployed and live-verified at 2026-09-16T13:48:53.769Z; all 74 migrations applied.

- Saved email drafts now restore without automatically opening over project work; finance dialogs stay above the composer.
- Added starter templates and automatic mapped Drive folders for new projects; existing jobs keep their editor and files.
- Added separate client/planned supplier rates, paste, undo, version checks, client/internal notes, frozen recorded approvals and stable planned-cost handoff. Revised approvals preserve live costs and prior snapshots.
- Added Drive invoice-folder review, file-boundary checks and duplicate import prevention. Supplier costs distinguish planned allowances from actual commitments; forecast margin uses the latest approved client total.
- Client PDFs now exclude the internal-notes fallback and identify draft/approved status. Internal exports file into Budgets. Added Invoices, Client Invoices and Reconciliation file categories.
- Isolated migration/Drive/finance and browser verification; [release record](docs/releases/2026-09-16-new-project-workflow.md) tracks deployment. No live financial rows or customer Drive files were created for testing.
- Remaining: PO linkage, client receivables, credits/FX, automatic extraction and formal close.

## 2026-09-16 — independent supplier finance pilot

- Deployed and live-verified at 2026-09-16T13:00:47.156Z; applied the additive finance migration and passed authenticated pilot/mobile checks.
- Added Estimate / Live costs / Invoices / Reconcile views, stable project costs, supplier invoices, net cost allocations and partial gross-payment records. Operational changes do not write estimate revisions.
- Added duplicate-request/invoice prevention, project transaction locks, stale-edit checks, invoice correction, payment reversal and atomic audit history. Finance summaries distinguish new-register balances from existing estimate totals.
- Passed isolated migration/financial correctness and full browser workflow checks. French Hair Lab selected as pilot; real financial records remain unchanged. Existing rows, POs and receipts are not automatically migrated. Credits, FX and client receivables remain outstanding.
- [Implementation](docs/production-hub/FINANCE-IMPLEMENTATION.md) · [release and validation](docs/releases/2026-09-16-finance-register.md).

## 2026-09-16 — connected Drive and working documents

- Verified app-owned Drive consent, token refresh, root read/write capability and existing folder structure. Zero app projects were linked at this audit; no remote folders/files were changed.
- Clarified the requested two-way workflow: edit the same native Slides/document file through its Google link; financial Sheet-cell synchronisation is outside this request.
- Drive browser now refreshes when returning to the app and offers manual Refresh. Existing PDF exports remain snapshots. Frontend build, targeted lint and browser checks for stable Slides links, focus/manual refresh, errors and mobile layout passed.
- Recorded existing project-code mismatches and the planned folder/category mapping in [the document workflow](docs/production-hub/DRIVE-WORKFLOW.md). No automatic organisation or native-deck PDF publishing is claimed.

## 2026-09-16 — Drive activation diagnostics

- Replaced the generic Drive 403 message with specific guidance for a disabled API, missing OAuth permission, Workspace policy and quota errors. Unknown/folder denials retain the safe fallback; provider payloads and credentials are never returned.
- Backend build and reason-mapping/session regression tests passed. Deployed by PM2 reload. The user passed session validation but Drive returned 403; its exact historical reason was not retained, so live activation remains unverified.

## 2026-09-16 — existing-session Google return fix

- Existing stored sessions retained SameSite=Strict after deployment, so Google callbacks arrived without the login cookie. Starting Drive consent now sets SameSite=Lax before saving the state and redirecting; Secure and HttpOnly remain enabled in production.
- Verified real session cookie serialization, isolated Drive integration, and a live browser returning from Google with a pre-existing Strict session. Missing-session callbacks remain rejected. Actual consent/publishing remains pending.

## 2026-09-16 — Google sign-in hotfix

- Reused the registered Google callback after the new Drive callback triggered `redirect_uri_mismatch`. Drive uses prefixed, expiring session state and separate encrypted token storage; Gmail dispatch remains available.
- Backend build and isolated integration checks passed, including successful Drive consent, matching token-exchange URI, wrong/expired/replayed state rejection, login enforcement and no Gmail account writes. Provider calls were mocked for these integration checks.
- Live callback verification and deployment evidence are appended to the [release record](docs/releases/2026-09-16-production-hub.md). User consent and a publishing pilot remain separate steps.

## 2026-09-16 — production hub direction reset

### Product and interface

- Adopted finance-first consolidation on the existing VPS stack, with PostgreSQL for structured operations and Drive for published project files.
- Added Home/Actions/command navigation and focused project entry points; retained specialist production tools.
- Prioritised Projects, People, Finance and Files & exports in navigation.
- Replaced the empty budget landing page with a searchable Finance index and links into project Costs, POs and documents.

### Backend and files

- Added a slim project-summary endpoint and removed email-body loading from project thread previews.
- Added app-owned Drive authorisation, exact folder links, new-project folder creation, paginated browsing, persistent publication/retry state and Drive-backed downloads.
- Reserved Drive file IDs before upload to recover interrupted responses without duplicate documents; retained local staging/recovery files.
- Added additive migration `20260916130000_project_drive_storage`.

### Documentation and release

- Deployed at 2026-09-16T11:55:17.403Z; applied the Drive migration, reloaded PM2 and published the frontend. Authenticated APIs and live desktop/mobile navigation passed. Drive remains configured but not consented.

- Replaced contradictory active briefs/instructions; restored a maintained changelog and concise handover.
- Archived 33 pre-reset Markdown originals, including 9 already-deleted Git versions, with checksums. Historical metrics remain dated evidence.
- Updated all active Markdown references and classified the generated July export report as historical.
- Deployment, backup, checks and Google activation state: [release record](docs/releases/2026-09-16-production-hub.md).

### Validation and limits

Backend/frontend builds, changed-file lint, isolated migration/Drive integration tests and browser workflow checks passed during implementation. The release record contains the deployment verification. The full-project lint has an existing SelectsPortal hook-dependency warning. Post-reload Gmail sync logged a missing-thread 404; it is recorded as an integration warning, not hidden by the successful UI checks.

Finance still uses the existing budget data model; the independent invoice/payment ledger and workbook consolidation remain next work. Google external consent is separate from deployment. Existing working casting/location Apps Scripts have not been replaced.

## Earlier changes

The current release includes pre-existing uncommitted options/crew, supplier onboarding, selects, itineraries, email and workbook work from the shared checkout. Their exact authorship and historical deployment status are not inferred from an old Git commit. Preserve their migrations and source; consult the archived handover and release source manifest.
