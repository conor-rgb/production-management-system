# Production hub frontend

React/TypeScript/Vite UI for Unlimited.Bond. Current product decisions live in [BRIEF.md](../BRIEF.md); this is not the starter-template README or a Next.js migration.

## Navigation and data

Main navigation: Home, Projects, People, Finance, Files & exports. Secondary tools preserve actions, enquiries, calendar, email and reporting. Project workspace keeps production modules accessible; avoid adding a new editor for an existing record owner.

Use `/api/productions/summary` for project indexes, search and pickers where its contract fits. Fetch detailed modules on demand. Finance's current totals are saved project values, not an independent invoice/payment ledger. Drive workspace components show connection/link/publish failures explicitly.

## Development and verification

`npm ci`, `npm run dev` (5173, API proxy 3000), `npm run build`, `npm run lint`. Configure the backend through its private environment file; never bundle OAuth secrets.

Browser fixtures: run Vite on 127.0.0.1:5175, then `node scripts/tests/workspace-smoke.cjs` and `node scripts/tests/drive-ui-smoke.cjs` from the repository root. Fixtures are not live business data or proof of Google consent.

Built assets go to `dist`. Publishing them to `/var/www/agent` is a separate deployment action governed by [docs/deploy.md](../docs/deploy.md). Preserve previous hashed assets during a release so already-open sessions can load their chunks.
