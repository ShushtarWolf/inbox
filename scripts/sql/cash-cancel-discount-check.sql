-- READ ONLY. Desk cash bookings with a discount whose stored amount went back to full price
-- (re-save via mark-paid / mark-unpaid / equipment dropped the discount; fixed in fix/cash-cancel-discount).
-- Phones masked. Run: psql "$DATABASE_URL" -f scripts/sql/cash-cancel-discount-check.sql
BEGIN TRANSACTION READ ONLY;

-- 1) Behnaz's club, last 3 days: every desk booking with a discount or a cancel, stored vs expected amount
SELECT b.id AS booking_id, b.status AS booking_status, b.source, b."paymentMethod" AS booking_method,
       s.date, s."startTime", c."nameFa" AS court, s.price AS slot_list_price,
       p.method, p.status AS pay_status, p.amount AS stored_amount,
       m ->> 'discountCode' AS code, m ->> 'discountPercent' AS code_pct, m ->> 'deskDiscountPercent' AS desk_pct,
       m ->> 'complimentary' AS comp, m ->> 'subtotalBeforeDiscount' AS subtotal, m ->> 'discountAmount' AS discount_amount,
       (m ->> 'subtotalBeforeDiscount')::numeric - (m ->> 'discountAmount')::numeric AS expected_amount,
       m ->> 'refundChannel' AS refund_channel, m ->> 'deskCashReturn' AS desk_cash_return,
       left(regexp_replace(coalesce(b."guestMobile", ''), '\D', '', 'g'), 4) || '****' AS mobile_masked,
       b."createdAt" AT TIME ZONE 'Asia/Tehran' AS created_tehran,
       p."updatedAt" AT TIME ZONE 'Asia/Tehran' AS payment_updated_tehran
FROM "Booking" b
JOIN "Slot" s ON s.id = b."slotId"
JOIN "Court" c ON c.id = s."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
LEFT JOIN LATERAL (
  SELECT p.* FROM "Payment" p
  WHERE p."bookingId" = b.id OR p."metadataJson"::jsonb ->> 'detachedFromBookingId' = b.id
  ORDER BY p."createdAt" DESC LIMIT 1
) p ON true
LEFT JOIN LATERAL (SELECT coalesce(p."metadataJson", '{}')::jsonb AS m) mm ON true
WHERE cl."nameFa" LIKE '%علم و صنعت%'
  AND b."createdAt" >= TIMESTAMPTZ '2026-11-12 00:00+03:30'
  AND (m ? 'discountCode' OR m ? 'deskDiscountPercent' OR m ? 'complimentary' OR b.status = 'CANCELLED')
ORDER BY b."createdAt" DESC;

-- 2) Platform-wide blast radius: discounted payments whose amount != subtotal - discount
SELECT count(*) AS mismatched, sum(p.amount - ((m ->> 'subtotalBeforeDiscount')::numeric - (m ->> 'discountAmount')::numeric)) AS overstated_toman
FROM "Payment" p, LATERAL (SELECT p."metadataJson"::jsonb AS m) x
WHERE p."metadataJson" IS NOT NULL AND m ? 'subtotalBeforeDiscount' AND m ? 'discountAmount'
  AND p.amount <> (m ->> 'subtotalBeforeDiscount')::numeric - (m ->> 'discountAmount')::numeric;

-- 3) Desk confirm «جمع کل ۰»: payments stored at 0 with a 100% desk percent / code (percent input clamps to 100)
SELECT p.id, p.amount, p.status, m ->> 'deskDiscountPercent' AS desk_pct, m ->> 'discountPercent' AS code_pct, m ->> 'complimentary' AS comp,
       p."createdAt" AT TIME ZONE 'Asia/Tehran' AS created_tehran
FROM "Payment" p, LATERAL (SELECT coalesce(p."metadataJson", '{}')::jsonb AS m) x
WHERE p."createdAt" >= TIMESTAMPTZ '2026-11-10 00:00+03:30' AND p.amount = 0
  AND (m ->> 'deskDiscountPercent' = '100' OR m ->> 'discountPercent' = '100' OR m ->> 'complimentary' = 'true')
ORDER BY p."createdAt" DESC LIMIT 20;

ROLLBACK;
