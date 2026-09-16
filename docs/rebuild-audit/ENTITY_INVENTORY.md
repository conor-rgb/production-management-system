# Entity ownership and consolidation

Updated 16 September 2026. [Historical entity inventory](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/ENTITY_INVENTORY.md) lists July migration candidates; it does not authorise dropping current tables.

| Domain | Current records and ownership |
| --- | --- |
| Projects | Production, Opportunity, dates, workstreams and ProjectAction |
| People | BlackbookEntry/addresses/configuration plus existing Contact/Company bridges |
| Holds/bookings | OptionGroup/Requirement/Candidate, date statuses, slot assignments and CrewMember |
| Logistics | CrewItinerary/items/appendix/file links; broader shared journey ownership is planned |
| Finance | Budget/Revision/Section/LineItem/SubCost, PO groups, advances and receipt captures; independent invoice/payment allocation models are planned |
| Documents | JobFile metadata, project Drive folder IDs, DriveConnection and durable publishing state; binaries stay outside PostgreSQL |
| Delivery | Still/selects/SKU/share/annotation/retouch/source-asset records |
| Communication | Email accounts/threads/messages/drafts/attachments, notes, calendar links and exact source references |
| Transitional workbook | Workbook/sheet/row/cell records; preserve manual-only data before consolidation |

Preserve current IDs, operational relationships and public links. Empty tables or repeated names are not deletion/deduplication criteria. Session records support the running application and are retained. Credentials are excluded from analytical exports but retained securely in operational backups; a separate rebuild would require a deliberate credential strategy.
