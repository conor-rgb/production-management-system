# Environment configuration

Updated 16 September 2026. Values belong only in private `backend/.env` or the deployment environment. No secret values are documented. See [backend/.env.example](../../backend/.env.example).

| Purpose | Variables |
| --- | --- |
| Runtime/session/database | NODE_ENV, PORT, DATABASE_URL, FRONTEND_URL, PUBLIC_BASE_URL, SESSION_SECRET |
| Google mail/calendar | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_CALENDAR_ID |
| Drive | GOOGLE_DRIVE_REDIRECT_URI, GOOGLE_DRIVE_ROOT_FOLDER_ID; uses the same Google client credentials, with separate consent/token storage |
| Credential encryption | EMAIL_ENCRYPTION_KEY (32 characters under the existing encryption service) |
| Mail sync | EMAIL_SYNC_DAYS, EMAIL_SYNC_LIMIT |
| Maps/Places | GOOGLE_MAPS_API_KEY, GOOGLE_PLACES_API_KEY |
| Receipt/travel extraction | ANTHROPIC_API_KEY |
| Branding | BRAND_LOGO_PATH |
| Development-only seed | SEED_DEFAULT_ADMIN, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD |

Production Drive callback: `https://agent.unlimited.bond/api/email/oauth/google/callback`. Root: `1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR`. Register the callback with the Google OAuth client; setting it locally is not proof Google accepted it. The Drive app connection is not the assistant connector.

Keep SEED_DEFAULT_ADMIN=false and GMAIL_RESYNC_CLEANUP disabled in production. Do not rotate encryption/session keys incidentally during a release. Legacy JWT/Redis/S3/SendGrid/FreeAgent keys were observed in older configuration, but their existence does not mean those services implement the current architecture. The [original inventory](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/ENV_VARIABLES.md) preserves that evidence.
