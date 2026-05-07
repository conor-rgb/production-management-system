unlimited.bond — Production Management Web App
Project Brief v2.0

Overview
A clean, fast, standalone web application for unlimited.bond (registered: BOND UN LIMITED) to manage the full commercial production lifecycle — from incoming enquiry through to wrapped job and invoice. Hosted on an existing VPS, with its own database, a fully integrated email client, AICP-standard budgeting, an internal file system, and FreeAgent accounting integration.
The app is the single place where all work happens. It must be fully operable on iPhone with one hand. Every screen should require minimal input and maximum clarity. Zero friction is the primary design principle throughout.

Company Context

Trading name: unlimited.bond
Registered entity: BOND UN LIMITED
VAT number: GB 493336372
Company number: 16215041
Job code format: YYNN — year + sequential number, resets to 01 each January (e.g. 2601, 2647). Next job: 2647
Services: Stills, motion, and events production
Production fee: Open percentage field (typically 5%, 10%, or 15%) applied to client-facing total only — never shown to client as a line item


Tech Stack

Server: Existing VPS (Linux/Ubuntu)
Runtime: Node.js
Database: PostgreSQL (standalone, self-hosted on VPS)
Email incoming: ImapFlow (modern promise-based IMAP client for Node.js)
Email outgoing: Nodemailer (SMTP)
Email parsing: mailparser (converts raw MIME to structured objects)
Email auth: OAuth2 — supports multiple connected email accounts
Receipt parsing: Claude API (Anthropic) — AI parses receipt images into structured data (vendor, amount, date, suggested line item)
Accounting: FreeAgent API (existing integration)
File storage: Local VPS filesystem, structured per job
Frontend: React, mobile-first
Auth: Single user (Conor), session-based login with secure cookie


Core Modules

1. Dashboard
The home screen. The first screen opened every day. Shows only what needs attention — nothing more.
Layout — top to bottom:

Today's agenda — date-specific view showing: shoot days active today, scheduled calls or meetings (PPM, Zoom, Recce, Fitting), overdue follow-ups flagged in red
Opportunities summary — open opportunities grouped by stage with counts
Active productions — each live job showing job code, client, status, next key date, and budget variance (red if over)
Outstanding invoices — total outstanding pulled from FreeAgent, count of unpaid
Unread email count — tap to go straight to inbox

Receipt capture widget:

Persistent camera/upload button on Dashboard (always visible)
On mobile: opens camera directly
On desktop: drag and drop or file picker
On capture: AI (Claude API) parses the image and returns vendor name, amount, date, and a suggested AICP budget category
User confirms or corrects the parse, then assigns to a specific job and line item
Receipt image saved automatically to that job's Receipts/ folder in the file system
Actual cost updated on the relevant budget line item immediately

Behaviour:

Refreshes on load
Tap any item to drill straight into it
Overdue follow-ups always shown in red regardless of where they appear


2. Email Client
A fully integrated inbox and composer. Connects to Conor's email accounts via OAuth and IMAP/SMTP. Every email is in context — automatically linked to the relevant contact, opportunity, or production. No need to leave the app.
Account setup:

OAuth2 connection — multiple email accounts supported simultaneously
Unified inbox across all connected accounts
Accounts managed in Settings

Inbox view:

All incoming mail in unified chronological list
Sender name resolved against Contacts database — shows company name and linked job or opportunity beside each email
Unread / read / flagged states
Swipe actions on mobile: Archive / Link to job / Flag for follow-up
Search across all email

Thread view:

Sent and received together in one chronological scroll — no separate sent folder
Linked job or opportunity shown as a tappable tag at the top of the thread
One tap to re-link if the auto-match is wrong
Reply / Reply all / Forward inline within the thread
Attachment handling: receive and preview files (images, PDFs) inline; option to save any attachment directly to a specific job folder in the file system
Unread badge clears on open

Composer:

Accessible from any screen in the app via a persistent compose button
To / CC / BCC fields — CC and BCC supported in templates
To field auto-completes from Contacts database
Optional: link to an Opportunity or Production before sending — email is then logged against that record's comms timeline automatically
unlimited.bond email signature pre-loaded, editable in Settings
Attachment support — attach files from device or from the app's file system

Templates:

Dedicated templates section in Settings
Create, edit, and delete templates
Each template supports: subject, body, CC fields, default attachments
Available templates to create on setup:

Quote follow-up
Shoot confirmation
PPM invite
Wrap notification
Invoice chase



Smart linking:

On receipt, app matches sender email against Contacts database
If matched, email auto-links to that contact's most recent active Opportunity or Production
Unmatched emails flagged in inbox for manual linking — one tap to assign
All emails linked to a job appear in that job's comms timeline in chronological order

Background sync:

IMAP IDLE connection keeps inbox live without manual refresh
New email triggers unread badge on Dashboard and nav item
Runs as persistent background process on VPS


3. Opportunities
Every enquiry from first contact to won or lost. The new business pipeline.
Stages:
Enquiry → Bidding → Quoted → Won → Lost
Fields per opportunity:

Date received
Client name
Brand
Job type (Stills / Motion / Events)
Source (Email / WhatsApp / DM / Referral / Other)
Contact name — linked to Contacts database
Brief description
Estimated value (£, ex-VAT)
Current stage
Follow-up date
Notes

Views:

Kanban — columns per stage, drag cards between stages
List — sortable table view
Toggle between views, preference remembered

Comms timeline per opportunity:

All linked emails displayed chronologically
Manual notes loggable inline (with timestamp)
Tasks created and checked off inline
Daylite-style unified activity feed — emails, notes, and tasks in one scroll

Key behaviours:

Overdue follow-ups auto-surface on Dashboard in red
Marking as Won auto-creates a Production record with client, brand, job type, estimated value, and contact pre-filled
Marking as Lost prompts for reason (Competitor won / Budget pulled / No response / Timing / Other) and archives the record — searchable but removed from active views
Multiple opportunities open simultaneously for the same client supported


4. Productions
One record per active job. The operational centre of the production from pre-pro through to wrap.
Fields per production:

Job code — auto-generated on creation (YYNN format, resets each January)
Client
Brand
Job type (Stills / Motion / Events)
Production status — single tap to update: Pre-pro → Shoot → Post → Wrapped
Quoted value (£, ex-VAT) — pulled from Budget module total
Actual spend (£) — live from Budget module actuals
Variance (£ and %) — auto-calculated, displayed in red when actual exceeds quoted
FreeAgent invoice status — pulled live from FreeAgent API
Notes
Comms timeline (see below)

Production dates panel:
Separate structured list of all key dates for the job. Each date entry has:

Date type: PPM / Recce / Fitting / Meeting / Shoot Day / Post Delivery / Other
Date and time
Location or platform (e.g. Zoom, Studio, Client office)
Zoom link field (optional)
People attached — linked from Contacts or Crew database
Notes

Multiple shoot days supported. All production dates appear in the Dashboard today's agenda view.
Crew module (inside Production):
A panel within the production record listing all crew attached to the job.

Roles pulled from a reusable roles database (Director / DOP / Photographer / 1st AD / Stylist / Hair & Makeup / Set Designer / Producer / Production Manager / Runner / Other)
New roles can be added to the database at any time
Each crew member has:

Name — linked to Suppliers in Contacts database
Role
Status: Requested / 1st Option / 2nd Option / Confirmed / Released
Day rate (internal, not shown to client)
Number of days
Notes


Crew saved in the Suppliers contact database — easy to search and add to future jobs
Crew list exportable as a simple call sheet

Comms timeline per production:

All linked emails in chronological order
Manual notes loggable inline
Tasks created and checked off inline
Daylite-style unified activity feed — emails, notes, tasks in one scroll
Fully searchable

Key behaviours:

Status updated with single tap
Variance turns red immediately when actual spend exceeds quoted
On status change to Wrapped: prompt to raise FreeAgent invoice with pre-filled details
Wrapped jobs move to archive — removed from active views but fully searchable
Google Drive folder creation available as optional secondary action on job creation (v1 optional — primary file storage is the in-app file system)


5. Budgets
Line-item budget per production, structured to the AICP commercial production standard. Always shows quoted vs actual so it's immediately clear if a job is on track.
Two views — toggle at top of screen:

Internal view — shows actual costs, internal rates, margin, and full financial detail. Never shared with client.
Client-facing view — shows client rates only, with production fee applied. Internal costs hidden entirely.

Pinned summary bar — always visible at top:

Client estimate total
Actual spend total
Variance (£ and %) — red if over

Production fee:

Open percentage field: typically 5%, 10%, or 15% — editable per job
Applied to client-facing total only as a single line at the bottom of the client view
Never shown as a named line item to the client — rolled into the total

AICP section structure:
CodeSectionAPre-Production & Wrap LaborBShooting Crew LaborCPre-Production Expenses (casting, scouts, vehicles, working meals)DLocation & Travel (location fees, permits, catering, craft service, trucking)EMakeup, Wardrobe & AnimalsFStudio & Stage (studio rental, power, security)GArt Department LaborHArt Department Expenses (props, set dressing, construction)IEquipment (camera, sound, lighting, grip)JFilm & Digital Media (hard drives, transcodes, memory)KMiscellaneous (shipping, insurance, petty cash)LDirector / Creative FeesMTalent LaborNTalent ExpensesOPost Production LaborPEditorial & Finishing
Sections can be shown or hidden per job — if a section has no line items it collapses automatically.
Per line item:

AICP line code (e.g. B_01, I_03)
Description
Internal unit cost (£)
Client unit cost (£) — separate field, shown in client view only
QTY
Days / Units (with unit label: Days / Units / Drives / Weeks / Other)
Internal subtotal — auto-calculated
Client subtotal — auto-calculated
Agency markup — open field per line (£ or %)
Actual cost (£)
Variance — auto-calculated, red if over
Invoice links — multiple invoices attachable per line item (e.g. 17 Uber receipts under D — Travel)

Receipt integration:

Receipts captured via the Dashboard receipt widget appear as pending items
User assigns each receipt to a job and a specific AICP line item
Receipt stored in the job's Receipts/ folder
Actual cost on that line item updates immediately

Invoice tracking per line:

Each line item can have multiple supplier invoices attached
Invoice fields: supplier name, invoice number, amount, date received, status (Pending / Paid)
Aggregated invoice total shown per line

PDF export:

Client-facing PDF: Professional cover page (unlimited.bond branding, job code, client name, date, version number) + AICP line item breakdown with client rates and production fee. Internal costs, internal rates, and margin completely hidden.
Internal PDF: Full breakdown including both cost columns, variance, and invoice status.
Version tracking — PDFs saved to the job's Estimates/ folder automatically on export with version number appended (e.g. 2647_Estimate_V1.pdf)


6. Contacts
Everyone unlimited.bond works with or sells to. The connective tissue linking emails, opportunities, productions, and crew together.
Two separate lists:
Clients — brands and agencies who commission unlimited.bond
Suppliers — crew, locations, equipment houses, and other vendors
Company + People structure:

Companies and individuals stored separately
Multiple people linked to one company (e.g. two contacts at the same brand)
Tap a company to see all associated people and all jobs

Fields per person:

Name
Company / Brand (linked)
Role / title
Email address (used for smart email linking)
Phone
Source — how they found unlimited.bond (Referral / Direct / Social / Previous job / Other)
Type — Client or Supplier
Last job (linked to Productions)
Last contacted date — auto-updated when email sent or received
Tags — multiple tags per contact (Returning client / Warm lead / Key account / Key crew / VIP / Other)
Notes

Key behaviours:

Searchable by name, company, email, or tag
Tap any contact to see full history: all linked jobs, all linked emails, all notes — in one timeline
New contact auto-created when an Opportunity is added with an unrecognised name
New supplier auto-created when a crew member is added to a production with an unrecognised name
Email smart-matching uses the email address field across both lists


7. File System
A built-in file system inside the app. Primary file storage for all job-related documents, images, receipts, and exports. Files stored on the VPS filesystem, organised by job.
Auto-created folder structure per job (on production creation):
YYNN — Client Brand/
├── Briefs/
├── Estimates/
├── Budgets/
├── Contracts/
├── Crew Deals/
├── Receipts/
├── References/
├── Selects/
└── Delivery/
File browser inside the app:

Tree view of all folders per job
Accessible from the Production record — Files tab
Upload files: drag and drop on desktop, camera or files app on mobile
Preview files inline: images and PDFs render in the app without downloading
Rename, move, and delete files
Download files to device

Receipt auto-filing:

Receipts captured via the Dashboard receipt widget land automatically in the job's Receipts/ folder once assigned to a job
Budget PDF exports land in Estimates/ automatically on export

Cross-job file browser:

Accessible from the main nav — browse all jobs and their files from one place
Searchable by filename

Storage:

All files stored on VPS local filesystem
File paths and metadata (filename, size, upload date, linked job, linked budget line) stored in PostgreSQL
Google Drive optional sync — v2 feature


Automations
TriggerActionOpportunity marked WonAuto-create Production record with job code, client, brand, type, value, contact pre-filledNew Production createdAuto-generate job code (YYNN, resets January) + auto-create folder structure in file systemFollow-up date passesRed flag on Dashboard today view + highlighted row in OpportunitiesActual spend exceeds quoted on any lineRed variance on budget line + red flag on Production record + alert on DashboardProduction marked WrappedPrompt to raise FreeAgent invoice pre-filled with job code, client, and budget totalsReceipt captured and assignedActual cost updated on budget line + image filed in job Receipts folderEmail received from known contactAuto-linked to most recent active Opportunity or Production for that contactBudget PDF exportedPDF auto-saved to job Estimates folder with version numberWeekly — Sunday 8amEmail digest sent to Conor: open opportunities with follow-up dates, upcoming shoot days this week, jobs with budget variance alerts, outstanding invoicesNew year — 1 JanuaryJob code sequence resets to 01

FreeAgent Integration

Pull invoice status per job into the Productions record (Unpaid / Viewed / Paid / Overdue)
Outstanding invoice total shown on Dashboard
On job Wrapped prompt: pre-populate FreeAgent invoice with job code, client name, and line item totals from the Budget module
All figures ex-VAT — VAT applied at invoice stage within FreeAgent
VAT number GB 493336372 pre-filled on all FreeAgent records


Design Principles

Mobile-first — fully operable on iPhone with one hand. Bottom navigation on mobile. Every tap target minimum 44px.
Zero friction — every common action reachable in 2 taps or fewer. New opportunity, new receipt, compose email — always one tap away.
Fast — aggressive caching on all list views. No heavy page loads. Skeleton screens while data loads.
Clean — dark sidebar navigation, full-width content area. Minimal UI, clear typographic hierarchy, no clutter. Professional but not corporate.
Offline-tolerant — last loaded data shown when signal is poor. Receipt capture queued offline and synced on reconnect.
Contextual — every screen surfaces only what is relevant. A production record shows its own emails, crew, dates, files, and budget — not the whole system.


Navigation Structure
Desktop — dark left sidebar (52px collapsed):

Dashboard
Email (with unread badge)
— divider —
Opportunities
Productions
Budgets
— divider —
Contacts
Files
— divider —
Settings (bottom)

Mobile — bottom navigation bar:

Dashboard
Email
Opportunities
Productions
More (Budgets / Contacts / Files / Settings)


Settings

Email accounts — connect / disconnect via OAuth
Email signature — rich text editor
Email templates — create, edit, delete
Crew roles — manage the reusable roles database
Contact tags — manage available tags
FreeAgent — connection status and re-auth
Job code — current sequence number (editable in case of manual correction)
unlimited.bond company details — used in PDF exports and email signatures
Receipt parser — Claude API key configuration


Out of Scope — v1

Client-facing portal
Multi-user / team access
Time tracking
Native iOS app
Calendar integration (iCal / Google Calendar sync)
Google Drive sync (file system is standalone in v1)
Advanced analytics and reporting


Success Criteria
The app is successful if Conor can:

Receive an email from a client, see it already linked to the right job, and reply without leaving the app
Log a new enquiry in under 30 seconds from his phone
Photograph a receipt on set and have it assigned to the right budget line in under 60 seconds
See the full status of all live productions — budget, dates, crew, invoices — on one screen
Know immediately if any job is over budget without opening the budget
Never miss a follow-up because the system surfaces it automatically
Export a professional client-facing PDF estimate directly from the budget screen


Claude Code Build Phases
Phase 1 — Foundation
VPS environment, Node.js, PostgreSQL schema covering all modules, Express server, session auth, login screen, mobile-first navigation shell
Phase 2 — Opportunities + Contacts
Full Opportunities CRUD, Kanban and list views, Contacts module (Clients and Suppliers, Company + People structure), comms timeline, auto-create contact from opportunity
Phase 3 — Productions + Crew + Dates
Productions module, job code auto-generation, production dates panel, crew module with status tracking, comms timeline, file system tab within production
Phase 4 — File System
In-app file browser, per-job folder auto-creation on production creation, upload from desktop and mobile, inline preview, receipt auto-filing
Phase 5 — Budgets
Full AICP budget module, internal vs client view toggle, line items with dual rates, production fee, variance calculation, invoice tracking per line, PDF export (client and internal versions)
Phase 6 — Email Client
IMAP connection via ImapFlow, OAuth multi-account setup, unified inbox, thread view, composer, smart linking, attachment handling, save-to-file-system, templates, IMAP IDLE background sync
Phase 7 — Receipt Capture
Dashboard receipt widget, camera on mobile, drag and drop on desktop, Claude API parsing, assignment flow to job and budget line, offline queue
Phase 8 — FreeAgent + Automations
FreeAgent API integration, invoice status pull, wrapped job invoice prompt, all automations, weekly email digest cron job
Phase 9 — Polish
Mobile UI refinement across all screens, performance and caching, error handling, offline states, skeleton screens, PDF branding, end-to-end QA

Brief v2.0 — unlimited.bond / BOND UN LIMITED — May 2026

---

## Brief Amendments — v2.1 — May 2026

The following decisions were made during the build and supersede or extend the original v2.0 brief. Claude Code should treat these amendments as higher priority than the original brief where there is any conflict.

---

### Artist / Talent Management — Removed
Artist and talent management has been removed from scope entirely. unlimited.bond is now purely a production company — no talent representation. All references to artist management, commission tracking, and talent rosters in v2.0 are void.

---

### Budget System — Significantly Expanded

The budget module is substantially more complex than described in v2.0. The full implemented system is:

**Two budget modes:**
- Bidding mode — when a budget belongs to an Opportunity. Shows internal cost, client rate, margin £, and margin % per line. No actuals. Summary bar shows: Client Estimate, Internal Cost, Total Margin, Margin %.
- Production mode — when a budget belongs to a Production (won from a bid). Shows accrual (held internal estimate), POs, invoiced, paid, remaining, and margin per line. Summary bar shows: Client Value, Accrual Held, Committed, Remaining, Projected Margin.

**Bid revisions:**
- Each budget has unlimited revisions
- Each revision is a complete standalone snapshot
- Revisions have a label, status (Draft / Sent / Approved / Rejected / Superseded), and version number
- Creating a new revision deep-copies all sections and line items from the current revision
- Old revisions are read-only and preserved as history
- PDF exports are versioned: `YYNN_Estimate_R{revision}_V{version}_{client|internal}.pdf`

**When a bid is won:**
- The opportunity budget is cloned to the new production budget
- The internal subtotals become the accrual/holding baseline for each line
- No POs or invoices are copied — production starts with zero committed spend
- The original opportunity budget is preserved as the historical bid record

**Accrual and purchase order system (production mode):**
- Each line item has an accrual (the internal estimate from the bid — the "holding pot")
- Money committed against a line comes in three forms: Open POs, Invoiced POs, Paid receipts/invoices
- Remaining = Accrual − Total Committed
- A line goes amber when committed > 80% of accrual
- A line goes red when committed > accrual (over holding)
- Margin is protected as long as committed never exceeds client total
- Lines can be "closed" when all POs are settled — releasing remaining accrual back to projected margin

**Purchase Orders:**
- POs created per line item in production mode
- PO number format: `PO-YYNN-NNN` sequential per production
- PO statuses: Open → Invoiced → Paid
- Only Open POs can be deleted

**Item catalog:**
- Reusable library of line items pre-seeded with comprehensive AICP items
- Organised by AICP section A through P
- Line Item Groups: named collections of catalog items insertable in one action
- Both managed in Settings → Item Catalog

**Budget UI:**
- Full screen view — not inside the production detail panel
- Accessed via Budget tab in Production or Opportunity detail → opens full screen
- Dark section headers with letter code badges (A, B, C etc.)
- Hybrid table layout — clean columns, not sentence format
- Inline cell editing — click any cell to edit, saves on blur, no save button
- Expanded edit form for complex fields (memo, overtime, taxable etc.) with amber border
- AICP sections collapsible, empty sections show compact single-line prompt
- Internal view shows all columns; client view shows client-facing columns only
- Pinned bottom bar with two rows: primary figures large, secondary figures small

---

### File System — Standalone, No Google Drive

The file system is fully standalone on the VPS. Google Drive integration is not planned even for v2. The brief reference to "Google Drive optional sync — v2 feature" is void.

Auto-created folder structure per production:
YYNN — Client Brand/
├── Briefs/
├── Estimates/
├── Budgets/
├── Contracts/
├── Crew Deals/
├── Receipts/
├── References/
├── Selects/
└── Delivery/

Budget PDF exports auto-file to `Estimates/` with version number in filename.
Receipts captured via Dashboard widget auto-file to `Receipts/`.

---

### Email Client — Implemented Details

The email client is more detailed than v2.0 described:

- Spark Mail-style thread view — collapsible messages, oldest first, latest expanded by default
- Quoted text auto-hidden with "Show previous message" pill to expand
- Sender signatures shown in muted italic, separated from body
- Sent emails synced from `[Gmail]/Sent Mail` and shown in Sent folder and inline in threads
- Sender names resolved: Contact database first → email fromName header → derived from email address → domain name for generic senders (noreply etc.)
- Deterministic avatar colors per sender email address
- Reply bar persists at email screen level — stays locked to originating thread even when viewing other threads
- OAuth app published to Production mode — refresh tokens do not expire
- IMAP sync window and limit configurable via `EMAIL_SYNC_DAYS` and `EMAIL_SYNC_LIMIT` in .env

---

### Job Code Format — Clarification

Format is YYNN where YY = 2-digit year and NN = 2-digit sequential number.
Example: 2647 = year 2026, job number 47.
Resets to 01 each January.
Current sequence stored in Settings table.
Next job code: 2647.

---

### Navigation — Budget moved to full screen

The Budget nav item in the sidebar does not have its own list view. Instead:
- Budgets are accessed via the Budget tab inside a Production or Opportunity record
- Clicking the Budget tab opens a full-screen budget view (URL: `/productions?production=id&view=budget`)
- Back button returns to the production or opportunity detail

---

### Design — Key decisions made during build

- Section headers in budget: dark background (#1a1a1f equivalent) with white text and letter code badge
- Empty AICP sections: compact single row, inline Browse catalog / + Add line links
- Line item rows: 36-40px height, 12px font, tabular number formatting
- Zero values: displayed in tertiary muted color to reduce visual noise
- Over-budget / over-accrual indicators: left border color on rows (amber warning, red over)
- All monetary values: £X,XXX.00 format, two decimal places
- All percentages: X.X% format, one decimal place

---

### Out of Scope additions

These were explicitly ruled out during the build in addition to the v2.0 out of scope list:

- Google Drive sync (any version)
- Artist / talent management (any version)
- Call sheet generation (deferred post-v1)
- Time tracking (confirmed out of scope)
