-- IB-67: owner SMS missing on student-card resubmit — Elahe / iust clubs / 2026-11-28 Tehran evening
-- READ-ONLY. Phones masked. Run inside BEGIN TRANSACTION READ ONLY ... ROLLBACK.

-- a) IUST-related clubs + owner notify phones (masked)
SELECT cl.id AS club_id,
       cl.slug,
       cl."nameFa",
       CASE WHEN ou.phone ~ '^(\+98|0098|98|0)?9[0-9]{9}$'
            THEN left(ou.phone, 4) || '***' || right(ou.phone, 4) ELSE '(no mobile)' END AS owner_mobile,
       CASE WHEN cl."bookingNotifyPhone" IS NULL OR cl."bookingNotifyPhone" = '' THEN '(unset)'
            ELSE left(cl."bookingNotifyPhone", 4) || '***' || right(cl."bookingNotifyPhone", 4) END AS booking_notify_phone,
       ou.name AS owner_name
FROM "Club" cl
LEFT JOIN "User" ou ON ou.id = cl."ownerId"
WHERE cl.slug LIKE 'iust%'
   OR cl."nameFa" LIKE '%علم و صنعت%'
ORDER BY cl.slug;

-- b) Discount programs (student) on those clubs
SELECT dp.id AS program_id,
       dp."titleFa",
       dp."verificationKind",
       dp.active,
       cl.slug AS club_slug
FROM "DiscountProgram" dp
JOIN "Club" cl ON cl.id = dp."clubId"
WHERE cl.slug LIKE 'iust%'
   OR cl."nameFa" LIKE '%علم و صنعت%'
ORDER BY cl.slug, dp."titleFa";

-- c) Athlete Elahe (name match) — users
SELECT u.id AS user_id,
       u.name,
       u."nameFamily",
       CASE WHEN u.phone ~ '^(\+98|0098|98|0)?9[0-9]{9}$'
            THEN left(u.phone, 4) || '***' || right(u.phone, 4) ELSE '(no mobile)' END AS athlete_mobile
FROM "User" u
WHERE lower(coalesce(u.name, '') || ' ' || coalesce(u."nameFamily", '')) LIKE '%elahe%'
   OR lower(coalesce(u.name, '')) LIKE '%الهه%'
   OR lower(coalesce(u."nameFamily", '')) LIKE '%الهه%';

-- d) Today's student discount applications on iust clubs (Tehran 2026-11-28), all statuses
SELECT da.id AS application_id,
       da.status,
       da."fullName",
       right(da."studentNumber", 4) AS student_no_last4,
       (da."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
       (da."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS updated_tehran,
       (da."reviewedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS reviewed_tehran,
       dp."titleFa" AS program_title,
       cl.slug AS club_slug,
       cl."nameFa" AS club_name,
       CASE WHEN u.phone ~ '^(\+98|0098|98|0)?9[0-9]{9}$'
            THEN left(u.phone, 4) || '***' || right(u.phone, 4) ELSE '(no mobile)' END AS athlete_mobile,
       coalesce(da."fullName", u.name) AS applicant_label
FROM "DiscountApplication" da
JOIN "Club" cl ON cl.id = da."clubId"
JOIN "DiscountProgram" dp ON dp.id = da."programId"
JOIN "User" u ON u.id = da."userId"
WHERE (cl.slug LIKE 'iust%' OR cl."nameFa" LIKE '%علم و صنعت%')
  AND dp."verificationKind" = 'STUDENT'
  AND (da."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date = '2026-11-28'
ORDER BY da."updatedAt" DESC;

-- e) In-app owner notifications for discount applications today
SELECT n.id,
       n.type,
       n.title,
       left(n.body, 80) AS body_prefix,
       (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS created_tehran,
       cl.slug AS club_slug,
       n."metadataJson"::jsonb ->> 'applicationId' AS application_id
FROM "Notification" n
LEFT JOIN "Club" cl ON cl.id = (n."metadataJson"::jsonb ->> 'clubId')
WHERE n.type = 'DISCOUNT_APPLICATION'
  AND (n."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date >= '2026-11-28'
ORDER BY n."createdAt" DESC
LIMIT 50;

-- f) SmsLog rows for OWNER_STUDENT_CARD_SUBMITTED (today + last 7 days on iust clubs)
SELECT s.id,
       s."campaignName",
       (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS sent_tehran,
       CASE WHEN s.recipient ~ '^(\+98|0098|98|0)?9[0-9]{9}$'
            THEN left(s.recipient, 4) || '***' || right(s.recipient, 4) ELSE '(masked)' END AS recipient,
       left(s.message, 120) AS message_prefix,
       cl.slug AS club_slug
FROM "SmsLog" s
JOIN "Club" cl ON cl.id = s."clubId"
WHERE s."campaignName" = 'OWNER_STUDENT_CARD_SUBMITTED'
  AND s."createdAt" > now() - interval '7 days'
  AND (cl.slug LIKE 'iust%' OR cl."nameFa" LIKE '%علم و صنعت%')
ORDER BY s."createdAt" DESC;

-- g) Any OWNER_STUDENT_CARD_SUBMITTED accepted today (all clubs) — volume check
SELECT (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date AS day_tehran,
       COUNT(*) AS accepted_sms
FROM "SmsLog" s
WHERE s."campaignName" = 'OWNER_STUDENT_CARD_SUBMITTED'
  AND s."createdAt" > now() - interval '3 days'
GROUP BY 1
ORDER BY 1 DESC;