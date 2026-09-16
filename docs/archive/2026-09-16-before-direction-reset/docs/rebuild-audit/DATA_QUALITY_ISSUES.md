# Data Quality Issues

Validation source: `exports/legacy-export/2026-07-31T123004279Z-full/validation-results.json`.

## Passed Checks

- Source/export counts match for all 68 exported models.
- Export checksums passed.
- Generic foreign-key orphan validation found 0 orphan relationship groups.
- Export errors: 0.

## Duplicate Candidates

The validator flags identity-like fields with repeated normalized values. These are candidates for review, not automatic errors.

- Total duplicate candidate groups: 266.
- `EmailMessage.gmailThreadId`: 198 groups; likely expected because multiple messages can belong to the same Gmail thread, but the migration should confirm intended semantics.
- `BudgetSection.name`: 29 groups; likely template/section repeats across revisions.
- `ProductionSku.name`: 15 groups; likely repeated SKU labels.
- `JobFile.originalFilename`: 11 groups; likely normal user uploads/repeated filenames.
- Other duplicate candidates: option group/template/requirement/candidate names, calendar event titles, crew member name/email, itinerary appendix page title.

## Obsolete Or Empty Data

- Several legacy/feature tables currently have zero rows and can likely be archived or omitted unless the new app needs their structure: `BlackbookTargetList`, `BlackbookTargetListEntry`, `OptionSavedView`, `OptionColumnValue`, `OptionSlotAssignment`, `ProductionDatePerson`, `BudgetLineTransfer`, `AdvanceInvoice`, `StillImageSku`, `StillSourceAsset`, `StillRetouchVersion`, `EmailDraft`, `EmailDraftAttachment`, `ActivityNote`, `ActivityTask`.

## Clarification Required

- Test-looking storage folders such as `2647 - Client Brand` and `2647 - TEST NAME TEST BRAND` need human review before migration as real jobs.
- The unmounted authenticated selects route file may indicate incomplete deployment or dead code.
- Root cron references a missing backup script.
