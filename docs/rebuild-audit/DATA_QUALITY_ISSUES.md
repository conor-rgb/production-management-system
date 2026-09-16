# Data quality and acceptance evidence

Updated 16 September 2026. [Current source audit](../production-hub/AUDIT.md); [July findings](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/DATA_QUALITY_ISSUES.md).

The July export matched counts/checksums for 68 models, reported no orphan relationship groups and flagged 266 duplicate-like groups. Those are historical export results, not a current clean bill of health. Repeated Gmail thread IDs across messages and repeated names across budget revisions are often expected.

The September source audit found shifted project setup values, template/example rows, inconsistent identifiers, stale validations and broken estimate-summary references. Do not silently import or correct these on name matching. Use approved estimate/invoice/payment evidence for the finance pilot.

Read-only comparison of 11 current budget summaries found no quote/actual-total mismatch on the inspected dataset, despite different formulas in code. That does not establish accounting truth or remove the structural risk. Benchmark and finance-check JSON files in production-hub are dated baseline artifacts.

Empty operational tables are not obsolete merely because one export contained zero rows. Authenticated selects are now mounted under productions; the old unmounted-route observation is obsolete. Preserve current sessions, drafts, joins and manual workbook rows until a specific reviewed migration accounts for them.
