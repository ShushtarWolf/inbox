-- Split legacy User.name into name (first token) + nameFamily (remainder).
-- Rule: first whitespace-delimited token = نام; rest = نام‌خانوادگی (see shared/userName.ts).

ALTER TABLE "User" ADD COLUMN "nameFamily" TEXT;

UPDATE "User"
SET
  "name" = CASE
    WHEN position(' ' in btrim("name")) > 0 THEN split_part(btrim("name"), ' ', 1)
    ELSE btrim("name")
  END,
  "nameFamily" = CASE
    WHEN position(' ' in btrim("name")) > 0 THEN NULLIF(
      btrim(substring(btrim("name") from length(split_part(btrim("name"), ' ', 1)) + 1)),
      ''
    )
    ELSE NULL
  END
WHERE btrim("name") <> '';
