-- IB-65 read-only: athletes who abandoned SEP (gateway_callback_abandon) while booking still live.
-- Rows that need ops attention: payment FAILED from gateway but booking.status = CANCELLED within 15m hold
-- (should be rare after UI fix; most IB-65 reports were booking.status PENDING with mistaken UI cancel).

SELECT b.id AS booking_id,
       b.status AS booking_status,
       b."paymentStatus",
       b."cancelledAt",
       b."cancellationReason",
       p.id AS payment_id,
       p.status AS payment_status,
       p."providerRef",
       p."metadataJson" ->> 'failReason' AS fail_reason,
       b."createdAt" AS booking_created_at,
       p."updatedAt" AS payment_updated_at
FROM "Booking" b
JOIN "Payment" p ON p."bookingId" = b.id
WHERE b.source = 'PLATFORM'
  AND p.status IN ('FAILED', 'PENDING_ONLINE')
  AND (
    p."metadataJson"::jsonb ->> 'failReason' = 'gateway_callback_abandon'
    OR (p.status = 'FAILED' AND p."gatewayRef" IS NULL AND b.status = 'CANCELLED'
        AND b."cancelledAt" IS NOT NULL
        AND b."cancelledAt" < b."createdAt" + interval '16 minutes')
  )
ORDER BY p."updatedAt" DESC
LIMIT 200;