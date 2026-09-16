# Security

This is a private business application. Do not publish credentials, database dumps, uploaded files, generated documents, or email data.

## Required Production Controls

- `SESSION_SECRET` must be set to a strong random value.
- `DATABASE_URL` must point at the production PostgreSQL database.
- Public links should use expiring, high-entropy tokens.
- `backend/storage` must be included in backups and excluded from git.
- Default admin seeding must not be enabled in production.

## Reporting

Report security issues privately to the repository owner or system maintainer. Do not open public issues for vulnerabilities.
