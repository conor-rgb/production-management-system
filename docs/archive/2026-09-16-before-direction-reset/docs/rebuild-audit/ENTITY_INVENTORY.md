# Entity Inventory

## Production Data Entities To Migrate

- Organisations/companies: `Company`, company-shaped `BlackbookEntry`.
- Contacts/artists/suppliers/locations/services/talent: `Contact`, `BlackbookEntry`, `BlackbookAddress`, config categories/types.
- Opportunities/projects/jobs/productions: `Opportunity`, `Production`, `ProductionDate`, `CalendarEvent`, `ProjectWorkstream`, `ProjectAction`.
- Options and holds: `OptionsBoard`, `OptionsCategory`, `Option`, `OptionPhoto`, `OptionGroup`, `OptionRequirement`, `RequirementDateNeed`, `OptionCandidate`, `CandidateDateStatusRecord`, `OptionSlotAssignment`, `OptionCandidatePhoto`, `OptionColumn`, `OptionColumnValue`, `OptionDeckTemplate`, `OptionSavedView`.
- Estimates/budgets/costs/expenses/invoices: `Budget`, `BudgetRevision`, `BudgetSection`, `BudgetLineItem`, `BudgetLineTransfer`, `SubCost`, `PurchaseOrderGroup`, `AdvanceInvoice`, `ReceiptCapture`.
- Suppliers and crew: `CrewRole`, `CrewMember`, `CrewItinerary`, `CrewItineraryItem`, `CrewItineraryAppendixPage`, `CrewItineraryItemFile`, supplier-style `BlackbookEntry`.
- Notes/tasks/approvals/deliverables: `OpportunityNote`, `OpportunityTask`, `ProjectAction`, `ActivityNote`, `ActivityTask`, still annotations/activity, share links.
- Usage terms and deliverables: fields on `Opportunity`, `Production`, `StillShareLink`, `StillImage`, `ProductionSku`, `JobFile`; no separate usage-terms model exists.
- Calendar references: `CalendarEvent`, production date Google fields, project action calendar linkage.
- Email-thread references: `EmailThread`, `EmailMessage`, source email references on `JobFile`, linked contact/opportunity/production fields.
- Assets/file metadata: `JobFile`, `StillImage`, `StillFolder`, `StillAnnotation`, `StillShareLink`, `ProductionSku`, retouch/source-asset tables.
- Travel/accommodation/call sheets: `CrewItinerary`, `CrewItineraryItem`, `CrewItineraryAppendixPage`, `CrewItineraryItemFile`, generated itinerary PDFs in `JobFile`.

## Archive Candidates

- Empty operational tables: target lists, option saved views, column values, slot assignments, production-date people, line transfers, advance invoices, still SKU joins, source assets, retouch versions, drafts, draft attachments, legacy activity notes/tasks.
- Session data: `Session` is excluded and should not be migrated.
- Credential/token fields: redacted from export and should be reconnected through fresh OAuth/auth flows.

## Human Clarification Needed

- Whether unmounted `selects.ts` should be active in the new app.
- Whether S3 environment config reflects old storage or planned storage.
- Whether FreeAgent integration was ever completed outside current mounted routes.
- Whether duplicate email `gmailThreadId` values in `EmailMessage` are expected because many messages share one Gmail thread.
