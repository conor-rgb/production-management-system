# Analytical export and migration evidence

The read-only exporter remains useful for inspection and mapping; it is not the deployment mechanism or a complete disaster-recovery backup. [Utility instructions](../../scripts/legacy-export/README.md); [historical plan/results](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/EXPORT_PLAN.md).

Commands: `npm --prefix backend run legacy:export:dry`, `legacy:export`, `legacy:validate`. JSON preserves IDs, foreign-key scalars, timestamps, nulls, arrays and JSON fields. CSV supports review. Sessions are excluded and credentials/tokens are redacted, including matching new refresh-token field names.

The previously validated full export at `exports/legacy-export/2026-07-31T123004279Z-full` contained 31,695 rows across 68 models. It is a July snapshot, not an up-to-date backup. Its report is retained as historical evidence and must not be rewritten to imply newer validation.

The new direction is in-place consolidation, not an automatic whole-system export/import. Preserve operational credentials securely during deployment; reconnect only when the integration requires new consent. For later finance migrations, generate a fresh read-only mapping/exception report, verify source documents and linked binaries, pilot, then cut over one owning workflow.
