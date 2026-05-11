# HANDOVER — 2026-05-11 — Email Draft Account Fallback Fix

## Built this session
- Fixed the `No email account` error when clicking Compose or Reply.
- Root cause: the connected Gmail account was active but `isPrimary=false`, while draft creation only looked for `isPrimary=true`.
- Updated `backend/src/routes/email.ts` so draft endpoints resolve email account as:
  1. primary active account if present
  2. first active account as fallback

## Verification
- Confirmed database account state: `conor@unlimited.bond` is active, Google provider, not primary.
- Backend build run after patch.
- PM2 reload required after backend build.

## Current composer state
- Spark-style composer and persistent bottom bar remain as built.
- Compose/Reply should now create drafts using the active Gmail account even when no account is marked primary.

## Exact next step
- In Settings, consider marking `conor@unlimited.bond` as primary to keep account semantics clean, but the app no longer depends on it for draft creation.
