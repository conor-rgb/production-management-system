# Work in the app and Google Drive

Confirmed 16 September 2026: “work from Drive” means editing presentations and other project documents in Google's editors, not synchronising financial cells between Sheets and the app.

## Foundation audit — before new-project setup

The app's own connection is authorised. Read-only verification refreshed its token, read `_PROJECTS`, confirmed permission to add children and listed its 30 immediate folders. There are zero linked app projects at this check. Two sampled job folders already use numbered Brief, Estimate, Contracts, Production, Deliverables and Archive folders. Hair Lab has `07 Casting`; Nicky Hilton Sep 26 has `07 Invoices`. Folder numbers alone do not identify a category.

No project folders were linked, moved, created or renamed during this audit. No live document publication was performed.

## Daily workflow available now

1. Open Files & exports, select a project and link its exact existing Drive folder.
2. Browse Drive inside that project. Open a native Slides, Docs or Sheets file using its Google link.
3. Edit the same document in Google. The app keeps opening that same file ID; no second editable copy is needed.
4. Return to the app. The Drive browser refreshes when its window regains focus; Refresh also fetches the current folder manually. Google owns the document content and save state. The app refresh is a file-list read, not a content merge or new revision generator.
5. Upload through the app or publish supported filed exports to the linked project. Legacy linked projects use `Production Hub/<category>`. New projects automatically provision and map numbered category folders; see [new project setup](NEW-PROJECT-WORKFLOW.md).

An exported PDF is a dated snapshot. Changes to the Slides deck do not alter that PDF. Re-export it deliberately when ready to issue. Existing app PDF generators do not automatically become editable Slides decks; keep a native working deck and an issued export as separate related documents.

## Resolve project identities before linking

The app's `French Hair Lab` has job code 2655, while Drive's `2657 | Hair Lab` uses 2657 and `2655 | Nicky Hilton Sep 26` is another job. Do not match these by code alone. Confirm the actual project identity and link the chosen Drive folder ID; treat app job-code correction as a separately reviewed change preserving historical references. Several other codes/titles differ too. Nothing has been auto-linked.

## Next organisational improvements — planned, not shipped

- Map document categories to verified existing folder IDs per project. Reuse numbered folders instead of adding duplicate structures; propose only genuinely missing destinations. Preserve permissions and existing contents.
- Add a project document register with a native working-file ID, category, owner, issued export IDs, source modification/version metadata and publication time. Pin the current casting/location/PPM decks so producers don't hunt through folders.
- Add deliberate “Publish PDF” for native decks: preview the export, choose its destination/audience and preserve previously issued versions. Mark an issued export as potentially out of date when its working deck changes. Export handling must account for Google's native-file size limits and supported download/export APIs.
- Add a durable Drive metadata index and change-feed processing if background search, automatic new-file discovery or stale-export alerts require it. Checkpoint changes only after applying them; recover interrupted scans, distinguish deletion from lost access and retain audit history. A refresh of the open folder is not this background synchronisation feature.
- Track renames and moves by Drive IDs. Moving a document outside its linked project or losing access should surface an exception; never silently recreate or move it back. Trash/delete propagation and cross-project moves need explicit actions and conflict handling.
- Suggest filing from document type and project context, with a preview of proposed changes. Invoice extraction can create a review candidate later, but must not silently change costs, approve an invoice or record a payment.

Pilot the folder mapping and working-deck/published-PDF relationship on one correctly matched job before applying organisation rules across `_PROJECTS`. Native editor changes remain in Drive; structured project, budget and reconciliation records remain in the app.

Google references: [file IDs and version metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [change tracking](https://developers.google.com/workspace/drive/api/guides/manage-changes).
