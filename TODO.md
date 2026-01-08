# TODO

## In Progress

- Configure SendGrid API credentials in `/srv/production-management-system/backend/.env`.
- Verify reset password email delivery end-to-end (SendGrid -> inbox -> reset link -> new password).
- Confirm `FRONTEND_URL` is set for reset links in `/srv/production-management-system/backend/.env`.
- Add backend env template docs for mail settings (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `FRONTEND_URL`).
- Add regression coverage for reset password flow (API + UI).

## Done

- Build frontend reset password page at `/reset-password`.
