-- Read-only: OTP login troubleshooting for one Iranian mobile.
-- Usage: replace :phone_normalized (09xxxxxxxxx) before run.
-- BEGIN … ROLLBACK — no writes.

BEGIN TRANSACTION READ ONLY;

\set phone '09XXXXXXXXX'

SELECT
  u.id,
  u.role,
  u."secondaryRole",
  u."tertiaryRole",
  u.phone,
  (u."passwordHash" IS NOT NULL) AS has_password,
  u."disabledAt",
  u."phoneVerifiedAt",
  u."lastLoginAt",
  u.email
FROM "User" u
WHERE u.phone IN (
  :'phone',
  ltrim(:'phone', '0'),
  '98' || ltrim(:'phone', '0'),
  '+98' || ltrim(:'phone', '0')
)
ORDER BY u."createdAt";

SELECT c.id AS club_id, c.slug, c."nameFa", c.phone AS club_phone, c.status, c."ownerId"
FROM "Club" c
WHERE c.phone = :'phone'
ORDER BY c.id;

SELECT
  o.id,
  o.phone,
  o.purpose,
  o.attempts,
  o."expiresAt",
  o."consumedAt",
  o."createdAt"
FROM "PhoneOtp" o
WHERE o.phone = :'phone'
ORDER BY o."createdAt" DESC
LIMIT 15;

ROLLBACK;