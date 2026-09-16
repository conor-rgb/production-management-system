# Status Doc Workflow Map

Source references:

- `build references/Status doc references/STATUS DOC - Four Seasons 2429.xlsx`
- `build references/Status doc references/Status Doc _ GANNI D3.xlsx`
- `build references/Status doc references/Status Doc _ Viktor & Rolf.xlsx`
- `build references/Status doc references/Options Doc - 4S Hampshire.xlsx`
- `build references/Status doc references/Pre-Production Timeline - 4S Hampshire.xlsx`

## What The Spreadsheets Are Doing

The status docs are not just reports. They are production control rooms. Each workbook combines the job dashboard, open tasks, crew/guest grids, supplier options, travel, hotels, equipment, deliveries, location holds, casting options, run of show, timeline, and meeting notes.

The recurring working sections are:

- Dashboard: project identity, client, job number, drive folder, estimates, status, key contacts.
- To-dos: owner-based tasks, loose questions, rates/answers, unallocated tasks.
- Timeline: date columns by department/workstream, with daily notes and deadlines.
- Run of show: time, phase, department, location, owner/supplier, action, client-facing notes.
- Crew list: role, name, email, phone, address, travel/hotel flags, NDA, dietary notes.
- Holds/options: role or supplier, date columns, hold status, rate, links, contact, notes.
- Travel grid: date, department, passenger, class, depart/arrive, time, booking details.
- Hotel grid: name, hotel, room type, dates, total nights, rate, total cost, confirmation.
- Cars/transfers: date, passenger, mobile, from/to, pickup time, company, booking ref.
- Equipment/deliveries: item, supplier, quantity/details, status, delivery time/place/contact.
- Locations/casting: option status, rate, links, contact, notes, selected preference.
- Meeting notes: agenda, attendees, decisions, follow-ups.

## Existing App Fit

The app already has most of the underlying entities, but the workflow is fragmented:

- Productions hold the job identity, status, dates, crew, budgets, files, emails, options, POs, selects, and actions.
- Options/workstreams can represent holds, supplier options, casting, locations, and department lanes.
- Project actions can represent to-dos, deadlines, meetings, travel, shoot actions, and run-of-show rows.
- Crew members carry role/name/contact/status/rate/dietary/call-time data.
- Crew itineraries cover car/train/flight/hotel/event detail, but these are per-person rather than a global travel grid.
- Budgets and POs cover financial tracking, but they are a separate module rather than surfaced in the production control view.
- Files and emails exist, but are not summarized into status-doc decisions or outstanding asks.

The main pain point is presentation and workflow cohesion, not lack of raw tables.

## Proposed Product Direction

Make `Productions` behave like the live status doc.

The first production screen should be a dense job control view, not a list of unrelated modules. Existing modules can stay, but the default experience should answer:

- What is the job?
- What needs doing today?
- Which departments/workstreams are blocked or waiting?
- Who is confirmed, optioned, requested, or released?
- What are the important dates, travel, hotel, cars, deliveries, and run-of-show items?
- What is ready to share with client/crew/suppliers?
- What is still missing?

## First Implementation Slice

Build a `Status Doc` tab inside a production before removing or refactoring older modules.

This tab should be read-heavy at first and pull existing data into workbook-shaped sections:

- Job header: job code, client, brand, title, status, value, next date, production status.
- Today / next 7 days: production dates and project actions.
- Open actions: grouped by owner/workstream/status, with waiting/blocker visibility.
- Workstreams: timeline lanes with counts for todo, waiting, done, and linked option groups.
- Crew and holds: confirmed crew plus first/second/requested/released option candidates.
- Logistics: travel/hotel/vehicle itinerary items summarized across crew.
- Equipment and deliveries: initially from project actions/workstreams, later structured if needed.
- Files/comms signals: recent linked files and email threads for the production.

This should reuse existing APIs where possible, adding one summary endpoint only if the frontend becomes too chatty.

## Later Simplification

After the `Status Doc` tab works, simplify around it:

- Rename or collapse confusing tabs so the status doc becomes the main production workspace.
- Move options, timeline, crew, dates, and POs behind context actions from the status doc.
- Standardize statuses to the spreadsheet language: requested, first option, second option, confirmed, released, sent, waiting, done, blocked.
- Introduce structured logistics only where the current itinerary model cannot support grid-style travel/hotel/car views.
- Add export/share views for crew list, call sheet/run of show, travel grid, hotel grid, and client-safe status.

## Guardrails

- Do not delete current features until the new status-doc view proves it covers the real workflow.
- Keep production storage/files untouched.
- Avoid big schema changes in the first pass.
- Prefer adapters and summaries over rewiring core data models immediately.
- Treat spreadsheets as messy source behavior, not exact UI blueprints.
