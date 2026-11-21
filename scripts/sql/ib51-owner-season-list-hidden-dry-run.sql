-- IB-51: seasons present in DB but omitted from owner GET /api/owner/seasons (old default limit=50, orderBy createdAt desc).
-- Run read-only: BEGIN; ... ROLLBACK;  (or against a Liara backup restore)
-- Does NOT touch payments / wallet.

-- Clubs where total season rows exceed the legacy API cap
SELECT c.id AS club_id,
       c."nameFa",
       COUNT(*)::int AS season_rows,
       GREATEST(COUNT(*)::int - 50, 0) AS hidden_under_legacy_cap
FROM "SeasonBooking" sb
JOIN "Club" c ON c.id = sb."clubId"
GROUP BY c.id, c."nameFa"
HAVING COUNT(*) > 50
ORDER BY season_rows DESC;

-- Per club: rows that would have been dropped (legacy ordering)
WITH ranked AS (
  SELECT sb.id,
         sb."clubId",
         sb."guestName",
         sb."guestFamily",
         right(sb."guestMobile", 4) AS mobile_tail,
         sb."startDate",
         sb."finishDate",
         sb."cancelledAt",
         sb."createdAt",
         ROW_NUMBER() OVER (
           PARTITION BY sb."clubId"
           ORDER BY sb."createdAt" DESC
         ) AS legacy_rank
  FROM "SeasonBooking" sb
)
SELECT r.*
FROM ranked r
JOIN "Club" c ON c.id = r."clubId"
WHERE r.legacy_rank > 50
ORDER BY c."nameFa", r.legacy_rank;