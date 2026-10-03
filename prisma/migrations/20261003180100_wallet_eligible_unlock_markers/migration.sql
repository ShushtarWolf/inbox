-- Marker UNLOCK rows (amount 0) for already-eligible class settlements that stayed in available,
-- so lazy unlock does not consume lockedBalance belonging to other payments.
-- Runs after LOCK/UNLOCK enum values exist (prior migration).

INSERT INTO "ClubWalletTransaction" ("id", "amount", "type", "note", "createdAt", "walletId", "paymentId", "bookingId")
SELECT
  md5(random()::text || clock_timestamp()::text)::text,
  0,
  'UNLOCK',
  'Migration: already cashout-eligible (no lock move)',
  NOW(),
  w.id,
  s."paymentId",
  s."bookingId"
FROM "SettlementLedgerEntry" s
JOIN "ClubWallet" w ON w."clubId" = s."clubId"
WHERE s."clubId" IS NOT NULL
  AND s."clawedBackAt" IS NULL
  AND s."classDate" IS NOT NULL
  AND s."classDate" < (CURRENT_DATE AT TIME ZONE 'Asia/Tehran')::date::text
  AND NOT EXISTS (
    SELECT 1 FROM "ClubWalletTransaction" x
    WHERE x."paymentId" = s."paymentId" AND x.type = 'UNLOCK'
  );

INSERT INTO "WalletTransaction" ("id", "amount", "type", "note", "createdAt", "walletId", "paymentId", "bookingId")
SELECT
  md5(random()::text || clock_timestamp()::text)::text,
  0,
  'UNLOCK',
  'Migration: already cashout-eligible (no lock move)',
  NOW(),
  w.id,
  s."paymentId",
  s."bookingId"
FROM "SettlementLedgerEntry" s
JOIN "Coach" c ON c.id = s."coachId"
JOIN "Wallet" w ON w."userId" = c."userId"
WHERE s."coachId" IS NOT NULL
  AND c."userId" IS NOT NULL
  AND s."clawedBackAt" IS NULL
  AND s."classDate" IS NOT NULL
  AND s."classDate" < (CURRENT_DATE AT TIME ZONE 'Asia/Tehran')::date::text
  AND NOT EXISTS (
    SELECT 1 FROM "WalletTransaction" x
    WHERE x."paymentId" = s."paymentId" AND x.type = 'UNLOCK'
  );
