# Legacy Export Validation Report

- Export directory: `/srv/production-management-system/exports/legacy-export/2026-07-31T123004279Z-full`
- Validated at: 2026-07-31T12:31:01.997Z
- Git commit: `153b47af95b33f16f37a1b06429d281b85354c54`
- Models validated: 68
- Checksum status: passed
- Count status: passed
- Orphan relationship groups: 0
- Duplicate candidate groups: 266

## Count Results

| Model | Source | Exported | JSON | Status |
| --- | ---: | ---: | ---: | --- |
| Settings | 1 | 1 | 1 | ok |
| Company | 1 | 1 | 1 | ok |
| Contact | 3 | 3 | 3 | ok |
| BlackbookConfigCategory | 10 | 10 | 10 | ok |
| BlackbookConfigType | 67 | 67 | 67 | ok |
| BlackbookTargetList | 0 | 0 | 0 | ok |
| BlackbookTargetListEntry | 0 | 0 | 0 | ok |
| BlackbookEntry | 19 | 19 | 19 | ok |
| BlackbookAddress | 12 | 12 | 12 | ok |
| Opportunity | 2 | 2 | 2 | ok |
| OpportunityNote | 0 | 0 | 0 | ok |
| OpportunityTask | 0 | 0 | 0 | ok |
| Production | 5 | 5 | 5 | ok |
| OptionsBoard | 1 | 1 | 1 | ok |
| OptionGroup | 9 | 9 | 9 | ok |
| OptionDeckTemplate | 3 | 3 | 3 | ok |
| OptionSavedView | 0 | 0 | 0 | ok |
| OptionRequirement | 11 | 11 | 11 | ok |
| RequirementDateNeed | 11 | 11 | 11 | ok |
| OptionCandidate | 33 | 33 | 33 | ok |
| OptionColumn | 90 | 90 | 90 | ok |
| OptionColumnValue | 0 | 0 | 0 | ok |
| OptionCandidatePhoto | 67 | 67 | 67 | ok |
| CandidateDateStatusRecord | 18 | 18 | 18 | ok |
| OptionSlotAssignment | 0 | 0 | 0 | ok |
| OptionsCategory | 2 | 2 | 2 | ok |
| Option | 16 | 16 | 16 | ok |
| OptionPhoto | 4 | 4 | 4 | ok |
| ProductionDate | 4 | 4 | 4 | ok |
| ProductionDatePerson | 0 | 0 | 0 | ok |
| CalendarEvent | 46 | 46 | 46 | ok |
| ProjectWorkstream | 7 | 7 | 7 | ok |
| ProjectAction | 2 | 2 | 2 | ok |
| CrewRole | 15 | 15 | 15 | ok |
| CrewMember | 5 | 5 | 5 | ok |
| CrewItinerary | 3 | 3 | 3 | ok |
| CrewItineraryItem | 37 | 37 | 37 | ok |
| CrewItineraryAppendixPage | 6 | 6 | 6 | ok |
| CrewItineraryItemFile | 4 | 4 | 4 | ok |
| Budget | 7 | 7 | 7 | ok |
| BudgetRevision | 11 | 11 | 11 | ok |
| BudgetSection | 125 | 125 | 125 | ok |
| BudgetLineItem | 383 | 383 | 383 | ok |
| BudgetLineTransfer | 0 | 0 | 0 | ok |
| SubCost | 43 | 43 | 43 | ok |
| PurchaseOrderGroup | 4 | 4 | 4 | ok |
| AdvanceInvoice | 0 | 0 | 0 | ok |
| SectionTemplate | 3 | 3 | 3 | ok |
| JobFile | 16551 | 16551 | 16551 | ok |
| ProductionSku | 90 | 90 | 90 | ok |
| StillFolder | 33 | 33 | 33 | ok |
| StillImage | 8195 | 8195 | 8195 | ok |
| StillImageSku | 0 | 0 | 0 | ok |
| StillAnnotation | 26 | 26 | 26 | ok |
| StillSourceAsset | 0 | 0 | 0 | ok |
| StillShareLink | 4 | 4 | 4 | ok |
| StillImageActivity | 1294 | 1294 | 1294 | ok |
| StillRetouchVersion | 0 | 0 | 0 | ok |
| ReceiptCapture | 3 | 3 | 3 | ok |
| EmailAccount | 1 | 1 | 1 | ok |
| EmailCategoryRule | 2 | 2 | 2 | ok |
| EmailDraft | 0 | 0 | 0 | ok |
| EmailDraftAttachment | 0 | 0 | 0 | ok |
| EmailThread | 1434 | 1434 | 1434 | ok |
| ActivityNote | 0 | 0 | 0 | ok |
| ActivityTask | 0 | 0 | 0 | ok |
| EmailMessage | 2967 | 2967 | 2967 | ok |
| EmailTemplate | 5 | 5 | 5 | ok |

## Warnings

- No orphaned required/optional foreign-key references were detected by the generic validator.
- OptionGroup.name: 1 duplicate candidate group(s).
- OptionDeckTemplate.name: 1 duplicate candidate group(s).
- OptionRequirement.name: 2 duplicate candidate group(s).
- OptionCandidate.name: 2 duplicate candidate group(s).
- CalendarEvent.title: 4 duplicate candidate group(s).
- CrewMember.name: 1 duplicate candidate group(s).
- CrewMember.email: 1 duplicate candidate group(s).
- CrewItineraryAppendixPage.title: 1 duplicate candidate group(s).
- BudgetSection.name: 29 duplicate candidate group(s).
- JobFile.originalFilename: 11 duplicate candidate group(s).
- ProductionSku.name: 15 duplicate candidate group(s).
- EmailMessage.gmailThreadId: 198 duplicate candidate group(s).
