-- READ ONLY. Owner-created seasons and whether any SMS reached the athlete mobile.
-- Before fix/season-athlete-sms the season wizard sent club-side SMS only (skipGuest: true).
-- Phones masked. Run: psql "$DATABASE_URL" -f scripts/sql/season-athlete-sms-gap.sql
BEGIN TRANSACTION READ ONLY;

WITH s AS (
  SELECT sb.id, sb."clubId", cl."nameFa" AS club, sb."guestMobile", sb."startDate", sb."finishDate",
         sb."createdAt", right(regexp_replace(sb."guestMobile", '\D', '', 'g'), 10) AS m10
  FROM "SeasonBooking" sb JOIN "Club" cl ON cl.id = sb."clubId"
  WHERE sb."createdAt" >= TIMESTAMPTZ '2026-11-13 00:00+03:30'
    AND cl."nameFa" LIKE '%علم و صنعت%'          -- drop this line for all clubs
)
SELECT s.id AS season_id, s.club, s."startDate", s."finishDate",
       s."createdAt" AT TIME ZONE 'Asia/Tehran' AS created_tehran,
       CASE WHEN s.m10 = '' THEN '(no mobile)' ELSE '0' || left(s.m10, 3) || '****' || right(s.m10, 3) END AS athlete_mobile,
       (SELECT count(*) FROM "SmsLog" l
         WHERE l."clubId" = s."clubId" AND s.m10 <> ''
           AND right(regexp_replace(l.recipient, '\D', '', 'g'), 10) = s.m10
           AND l."createdAt" BETWEEN s."createdAt" - interval '1 minute' AND s."createdAt" + interval '10 minutes') AS athlete_sms_rows,
       (SELECT string_agg(DISTINCT coalesce(l."campaignName", '-'), ',') FROM "SmsLog" l
         WHERE l."clubId" = s."clubId"
           AND l."createdAt" BETWEEN s."createdAt" - interval '1 minute' AND s."createdAt" + interval '10 minutes') AS any_sms_templates_near_create
FROM s ORDER BY s."createdAt" DESC;

-- Season bookings' payment state (cash PAID vs unpaid pay-link)
SELECT b.id, b.status, b."paymentStatus", p.method, p.status AS pay_status, sl.date, sl."startTime"
FROM "Booking" b JOIN "Slot" sl ON sl.id = b."slotId" JOIN "Court" c ON c.id = sl."courtId" JOIN "Club" cl ON cl.id = c."clubId"
LEFT JOIN "Payment" p ON p."bookingId" = b.id
WHERE b."createdAt" >= TIMESTAMPTZ '2026-11-14 00:00+03:30' AND cl."nameFa" LIKE '%علم و صنعت%'
ORDER BY b."createdAt" DESC LIMIT 40;

ROLLBACK;
