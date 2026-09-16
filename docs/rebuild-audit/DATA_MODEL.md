# Data model reference — historical inventory and current additions

Updated 16 September 2026. The model counts below are the July export snapshot, not current live counts. The authoritative schema is `backend/prisma/schema.prisma`; retain its migrations and IDs. The original document is [archived](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/DATA_MODEL.md).

## Additions and ownership changes since that inventory

- ProductionWorkbook/Sheet/Row/Cell support the transitional workbook. Manual-only content requires mapping before consolidation.
- Production adds unique nullable driveFolderId and driveFolderName.
- JobFile adds unique nullable driveFileId, driveWebViewLink, driveSyncStatus/error/syncedAt/leaseUntil and a queue index.
- DriveConnection stores one workspace root and encrypted refresh token. Tokens are never exposed in APIs or committed.
- Session remains the active session store; omission from redacted exports is not permission to drop it.
- Independent supplier invoice/payment/allocation models are implemented. New projects additionally have mapped Drive folders, estimate edit versions, stable line identities and immutable approvals; see [new project data and workflow](../production-hub/NEW-PROJECT-WORKFLOW.md). Legacy Budget/SubCost records remain unchanged.

## July 2026 snapshot (historical)

Source: July Prisma DMMF and `exports/legacy-export/2026-07-31T123004279Z-full`.

## Models And Relationships

- `Session` (excluded from export): no relations.
- `Settings` (1): admin/settings record; no relations; password redacted.
- `Company` (1): has `contacts`, `opportunities`.
- `Contact` (3): belongs to optional `Company`; has opportunities, crew members, production-date people, email threads/drafts, blackbook entries.
- `BlackbookConfigCategory` (10): has config types and blackbook entries.
- `BlackbookConfigType` (67): belongs to blackbook category.
- `BlackbookTargetList` (0): has list entries.
- `BlackbookTargetListEntry` (0): joins target list to blackbook entry.
- `BlackbookEntry` (19): optional contact, category config, parent company entry; has addresses, option candidates, purchase orders, project actions, crew members, target-list entries, people.
- `BlackbookAddress` (12): belongs to blackbook entry; used by option candidates.
- `Opportunity` (2): optional contact and company; has productions, budgets, notes, tasks, email threads/drafts, calendar events.
- `OpportunityNote` (0): belongs to opportunity.
- `OpportunityTask` (0): belongs to opportunity.
- `Production` (5): optional opportunity; has dates, crew, itineraries, budgets, files, email links, receipt captures, calendar events, workstreams, actions, options, POs, SKUs, stills, share links, activity.
- `OptionsBoard` (1): one per production; has categories.
- `OptionGroup` (9): belongs to production and optional workstream; has requirements, candidates, columns, views, deck template.
- `OptionDeckTemplate` (3): belongs to option group.
- `OptionSavedView` (0): belongs to option group.
- `OptionRequirement` (11): belongs to production and group; has date needs, assignments, project actions, crew members.
- `RequirementDateNeed` (11): joins requirement to production date.
- `OptionCandidate` (33): belongs to production and group; optional blackbook entry/address; has date statuses, assignments, photos, column values, POs, project actions, crew members.
- `OptionColumn` (90): belongs to option group; has values.
- `OptionColumnValue` (0): joins candidate and column.
- `OptionCandidatePhoto` (67): belongs to option candidate.
- `CandidateDateStatusRecord` (18): joins candidate and production date.
- `OptionSlotAssignment` (0): joins requirement, candidate, and production date.
- `OptionsCategory` (2): belongs to options board; has simple options.
- `Option` (16): belongs to options category; has photos.
- `OptionPhoto` (4): belongs to option.
- `ProductionDate` (4): belongs to production; has people, requirement needs, candidate statuses, slot assignments.
- `ProductionDatePerson` (0): joins production date and contact.
- `CalendarEvent` (46): optional production/opportunity; optional project action.
- `ProjectWorkstream` (7): belongs to production; optional legacy option group; has actions and current option groups.
- `ProjectAction` (2): optional production, workstream, requirement, candidate, blackbook entry, email thread/message, calendar event.
- `CrewRole` (15): has crew members.
- `CrewMember` (5): belongs to production; optional contact, blackbook entry, option candidate, role requirement, role; has optional itinerary.
- `CrewItinerary` (3): belongs to production and crew member; has items and appendix pages.
- `CrewItineraryItem` (37): belongs to itinerary; has file links.
- `CrewItineraryAppendixPage` (6): belongs to itinerary.
- `CrewItineraryItemFile` (4): joins itinerary item and job file.
- `Budget` (7): optional production/opportunity; current revision; has revisions, advances, purchase orders.
- `BudgetRevision` (11): belongs to budget; has sections and transfers.
- `BudgetSection` (125): belongs to revision; has line items.
- `BudgetLineItem` (383): belongs to section; optional parent line item; has subcosts, files, receipt captures, transfers.
- `BudgetLineTransfer` (0): belongs to revision and two line items.
- `SubCost` (43): belongs to budget line; optional PO, invoice file, proof-of-payment file.
- `PurchaseOrderGroup` (4): belongs to production; optional budget, blackbook entry, option candidate; has subcost allocations.
- `AdvanceInvoice` (0): belongs to budget.
- `SectionTemplate` (3): reusable budget template.
- `JobFile` (16551): optional production and budget line; optional source email thread/message; referenced by subcosts, receipts, stills, SKUs, itinerary files.
- `ProductionSku` (90): belongs to production; optional thumbnail job file; joins still images.
- `StillFolder` (33): belongs to production; optional parent folder; has images and share links.
- `StillImage` (8195): belongs to production and job file; optional thumbnail/folder; has SKUs, annotations, activity, retouch versions, source assets.
- `StillImageSku` (0): joins still image and SKU.
- `StillAnnotation` (26): belongs to still image.
- `StillSourceAsset` (0): belongs to still image; optional job file.
- `StillShareLink` (4): belongs to production; optional folder.
- `StillImageActivity` (1294): belongs to production; optional still image.
- `StillRetouchVersion` (0): belongs to still image and job file.
- `ReceiptCapture` (3): optional production, budget line, job file.
- `EmailAccount` (1): has threads, drafts, category rules; credential fields redacted.
- `EmailCategoryRule` (2): belongs to email account.
- `EmailDraft` (0): belongs to account; optional opportunity, production, contact; has attachments.
- `EmailDraftAttachment` (0): belongs to draft.
- `EmailThread` (1434): optional account/contact/opportunity/production; has messages, actions, source files.
- `ActivityNote` (0): legacy polymorphic note by entity type/id.
- `ActivityTask` (0): legacy polymorphic task by entity type/id.
- `EmailMessage` (2967): belongs to email thread; has job files and actions.
- `EmailTemplate` (5): email template library.

## Enums And Statuses

- CRM/contact: `ContactType`, `ContactSource`, `BlackbookEntryType`, `BlackbookCategory`, `BlackbookLifecycleStatus`, `BlackbookOutreachStatus`, `BlackbookAddressType`, `BlackbookAddressSource`.
- Jobs/opportunities: `PmsJobType`, `OppSource`, `Stage`, `LostReason`, `ProductionStatus`, `FreeAgentInvoiceStatus`, `ProductionDateType`, `ProductionDateStatus`.
- Options/holds: `OptionRequirementType`, `OptionRequirementState`, `OptionCandidateState`, `OptionColumnType`, `CandidateDateHoldStatus`, `OptionStatus`, `OptionAvailability`.
- Budgets/costs: `BudgetStatus`, `RevisionStatus`, `SubCostStatus`, `SubCostLineType`, `PurchaseOrderStatus`, `AdvanceCalcType`, `ReceiptCaptureStatus`.
- Crew/travel: `CrewStatus`, `CrewItineraryStatus`, `CrewItineraryItemType`.
- Calendar/actions: `ActivityEntityType`, `CalendarEventType`, `ProjectActionType`, `ProjectActionStatus`, `ProjectActionVisibility`.
- Selects/stills: `StillStatus`, `StillAnnotationVisibility`, `StillSourceAssetType`, `StillShareRole`, `StillActivityAction`.
- Email: `EmailProvider`, `EmailAutoCategory`, `EmailCategoryRuleMatchType`, `EmailUnsubscribeMethod`.

## Supplier finance pilot additions

Migration `20260916140000_project_finance_ledger` adds six independent project-ledger tables: ledger, cost, supplier invoice, allocation, recorded payment and operation/audit. Existing estimate/revision/SubCost records are unchanged. See [finance implementation](../production-hub/FINANCE-IMPLEMENTATION.md) for constraints, supported currencies and remaining migration gates.

## Supplier PO extension

The existing PurchaseOrderGroup now supports finance-managed orders with immutable issue snapshots and document state. ProjectPurchaseOrderLine links agreed net values to ProjectFinanceCost; optional JobFile.sourceKey deduplicates document filing. [PO data and rules](../production-hub/PURCHASE-ORDER-WORKFLOW.md).

## Client billing extension — 16 September 2026

ProjectClientInvoice and ProjectClientReceipt add an independent client register under ProjectFinanceLedger. Unique invoice references, issued JSON snapshots and protected JobFile links retain billing evidence. Active receipts settle gross invoice totals; issued net is compared to the latest ProjectEstimateApproval. No supplier cost or estimate mutations occur. See [workflow](../production-hub/CLIENT-BILLING-WORKFLOW.md).

## Client credits — 16 September 2026

ProjectClientInvoice.originalInvoiceId links CREDIT records and replacement invoices to issued originals. ProjectClientReceipt.direction distinguishes RECEIPT (existing-row default) from REFUND. Issued credit net/tax are subtracted from their original invoice; positive balances and refunds due aggregate separately. See [credit workflow](../production-hub/CLIENT-CREDIT-WORKFLOW.md).

## Supplier reconciliation — 16 September 2026

ProjectSupplierInvoice gains kind (INVOICE/CREDIT), a restrictive original-invoice relation and reviewNote. ProjectInvoicePayment gains PAYMENT/REFUND direction. Cost allocation credits subtract from actuals, but do not restore automatic unbilled allowances. Original invoice balances subtract approved credits and payments, adding received refunds. See [workflow](../production-hub/SUPPLIER-RECONCILIATION.md).
