# Environment Variables

Secret values are not recorded. Keys observed in `backend/.env`:

## Runtime

- `NODE_ENV`
- `PORT`
- `FRONTEND_URL`
- `PUBLIC_BASE_URL` (referenced in code; not observed in `.env`)
- `APP_VERSION`

## Database / Session / Auth

- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`

## Email / Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_ID` (referenced in code; not observed in `.env`)
- `EMAIL_ENCRYPTION_KEY`
- `EMAIL_SYNC_DAYS`
- `EMAIL_SYNC_LIMIT`
- `GMAIL_RESYNC_DONE`
- `GMAIL_RESYNC_CLEANUP` (dangerous write/delete path; referenced in code)
- `SENDGRID_API_KEY`
- `FROM_EMAIL`

## Storage

- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT`
- `BRAND_LOGO_PATH` (referenced in code)

## External Services

- `FREEAGENT_CLIENT_ID`
- `FREEAGENT_CLIENT_SECRET`
- `FREEAGENT_REDIRECT_URI`
- `FREEAGENT_SANDBOX`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_PLACES_API_KEY` (referenced in code)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Export Redactions

The legacy exporter excludes sessions and redacts password, secret, OAuth token, refresh token, JWT, API key, and client secret fields from exported data.
