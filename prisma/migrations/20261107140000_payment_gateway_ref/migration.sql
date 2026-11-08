-- Single-use SEP bank RefNum. Nullable: unverified and non-SEP rows stay null.
-- Postgres unique indexes allow many NULLs, so only a consumed capture is exclusive.
--
-- Backfill from metadata.refNum only when that value appears on exactly one row.
-- Historical duplicates are left null so this migration cannot fail or pick a winner.
-- Those rows keep working (already PAID). A replay of a duplicated legacy ref is
-- still rejected when verify echoes a different ResNum; ops can inspect leftovers
-- with: metadataJson LIKE '%"refNum"%' AND "gatewayRef" IS NULL AND provider = 'sep'.

ALTER TABLE "Payment" ADD COLUMN "gatewayRef" TEXT;

WITH extracted AS (
  SELECT
    id,
    NULLIF(
      BTRIM(
        substring("metadataJson" from '"refNum"[[:space:]]*:[[:space:]]*"([^"]+)"')
      ),
      ''
    ) AS ref
  FROM "Payment"
  WHERE provider = 'sep'
    AND "metadataJson" IS NOT NULL
    AND "metadataJson" LIKE '%"refNum"%'
),
unique_refs AS (
  SELECT ref
  FROM extracted
  WHERE ref IS NOT NULL
  GROUP BY ref
  HAVING COUNT(*) = 1
)
UPDATE "Payment" AS p
SET "gatewayRef" = e.ref
FROM extracted AS e
JOIN unique_refs AS u ON u.ref = e.ref
WHERE p.id = e.id
  AND p."gatewayRef" IS NULL;

CREATE UNIQUE INDEX "Payment_gatewayRef_key" ON "Payment"("gatewayRef");
