-- READ-ONLY. Finds when booking/cancel SMS stopped going out.
-- No UPDATE/INSERT/DELETE. Run inside a read-only transaction:
--   BEGIN TRANSACTION READ ONLY; \i sms-delivery-gap.sql ; ROLLBACK;
-- How to read it: in live mode the Kavenegar provider writes an SmsLog row ONLY after
-- Kavenegar accepted the message (HTTP 200 + return.status 200). A failed send leaves no row.
-- So a day with paid bookings / cancels but zero SmsLog rows = Kavenegar rejected them.
-- Times are shown in Asia/Tehran. Phone numbers are masked.

-- a) Accepted SMS per day and template, last 21 days.
SELECT (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date AS day_tehran,
       COALESCE(s."campaignName", '(none)') AS template,
       COUNT(*) AS accepted_by_kavenegar
FROM "SmsLog" s
WHERE s."createdAt" > now() - interval '21 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- b) Last accepted SMS of each booking template (the "since when").
SELECT COALESCE(s."campaignName", '(none)') AS template,
       MAX(s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran') AS last_accepted_tehran,
       COUNT(*) FILTER (WHERE s."createdAt" > now() - interval '7 days') AS last_7_days
FROM "SmsLog" s
WHERE s."campaignName" IN ('BOOKING_PAID','BOOKING_CANCELLED','BOOKING_CONFIRMED',
                           'OWNER_BOOKING_CONFIRMED','OWNER_BOOKING_CANCELLED','OWNER_DAILY_RESERVATIONS')
GROUP BY 1
ORDER BY 2 DESC NULLS LAST;

-- c) Events that SHOULD have produced SMS, per day (compare with a).
SELECT d.day_tehran,
       COALESCE(p.paid_bookings, 0)  AS paid_bookings,
       COALESCE(c.cancels, 0)        AS cancelled_bookings,
       COALESCE(l.accepted, 0)       AS sms_accepted
FROM (SELECT generate_series((now() AT TIME ZONE 'Asia/Tehran')::date - 20,
                             (now() AT TIME ZONE 'Asia/Tehran')::date, '1 day')::date AS day_tehran) d
LEFT JOIN (
  SELECT (py."updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date AS day_tehran, COUNT(*) AS paid_bookings
  FROM "Payment" py
  WHERE py.status = 'PAID' AND py."bookingId" IS NOT NULL AND py."updatedAt" > now() - interval '21 days'
  GROUP BY 1) p USING (day_tehran)
LEFT JOIN (
  SELECT (b."cancelledAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date AS day_tehran, COUNT(*) AS cancels
  FROM "Booking" b
  WHERE b.status = 'CANCELLED' AND b."cancelledAt" > now() - interval '21 days'
  GROUP BY 1) c USING (day_tehran)
LEFT JOIN (
  SELECT (s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran')::date AS day_tehran, COUNT(*) AS accepted
  FROM "SmsLog" s
  WHERE s."campaignName" LIKE 'BOOKING_%' OR s."campaignName" LIKE 'OWNER_BOOKING_%'
  GROUP BY 1) l USING (day_tehran)
ORDER BY 1 DESC;

-- d) Club-side recipients per club (owner mobile + bookingNotifyPhone), masked.
--    A club whose owner phone is empty/landline and has no bookingNotifyPhone gets no owner SMS.
SELECT cl.slug,
       CASE WHEN u.phone ~ '^(\+98|0098|98|0)?9[0-9]{9}$'
            THEN left(u.phone, 4) || '***' || right(u.phone, 4) ELSE '(no mobile)' END AS owner_mobile,
       CASE WHEN cl."bookingNotifyPhone" IS NULL OR cl."bookingNotifyPhone" = '' THEN '(unset)'
            ELSE left(cl."bookingNotifyPhone", 4) || '***' || right(cl."bookingNotifyPhone", 4) END AS booking_notify_phone
FROM "Club" cl
LEFT JOIN "User" u ON u.id = cl."ownerId"
ORDER BY cl.slug;
