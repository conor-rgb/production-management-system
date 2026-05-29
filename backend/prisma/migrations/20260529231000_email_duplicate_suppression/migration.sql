ALTER TABLE "pms_email_messages"
ADD COLUMN "isDuplicateSuppressed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "pms_email_messages_isDuplicateSuppressed_idx"
ON "pms_email_messages"("isDuplicateSuppressed");

WITH ordered AS (
  SELECT
    id,
    "sentAt",
    LAG("sentAt") OVER duplicate_window AS previous_sent_at
  FROM "pms_email_messages"
  WINDOW duplicate_window AS (
    PARTITION BY
      "threadId",
      lower("fromAddress"),
      lower(trim(subject)),
      array_to_string(ARRAY(
        SELECT lower(address)
        FROM unnest("toAddresses" || "ccAddresses" || "bccAddresses") AS address
        ORDER BY lower(address)
      ), ','),
      left(regexp_replace(coalesce("bodyText", snippet, ''), '\s+', ' ', 'g'), 240)
    ORDER BY "sentAt"
  )
),
duplicates AS (
  SELECT id
  FROM ordered
  WHERE previous_sent_at IS NOT NULL
    AND "sentAt" - previous_sent_at <= interval '30 seconds'
)
UPDATE "pms_email_messages"
SET "isDuplicateSuppressed" = true
WHERE id IN (SELECT id FROM duplicates);
