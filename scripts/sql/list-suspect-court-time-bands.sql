-- READ-ONLY. Lists every court that has time-band pricing, and flags the ones that
-- look unintended. No UPDATE/DELETE. Run inside a read-only transaction:
--   BEGIN TRANSACTION READ ONLY; \i list-suspect-court-time-bands.sql ; ROLLBACK;
-- Note: Court has no createdAt/updatedAt and court edits are not audited, so
-- "when" cannot be read directly; the slot/booking columns give indirect evidence.
WITH band AS (
  SELECT
    c.id                         AS court_id,
    c."clubId"                   AS club_id,
    c."nameFa"                   AS court_name,
    c.price                      AS base_price,
    b.elem->>'startTime'         AS band_start,
    b.elem->>'endTime'           AS band_end,
    (b.elem->>'price')::int      AS band_price,
    COALESCE(b.elem->>'labelFa','') AS band_label,
    (c."pricingJson"::jsonb -> 'lastSecondDiscount' ->> 'enabled')::boolean AS last_minute_on,
    (c."pricingJson"::jsonb -> 'lastSecondDiscount' ->> 'percent')::int     AS last_minute_pct
  FROM "Court" c
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(c."pricingJson"::jsonb -> 'timeBands', '[]'::jsonb)
  ) AS b(elem)
  WHERE c."pricingJson" IS NOT NULL AND c."pricingJson" <> ''
),
club_bands AS (
  SELECT club_id,
         COUNT(DISTINCT court_id) AS courts_with_bands,
         (SELECT COUNT(*) FROM "Court" x WHERE x."clubId" = band.club_id) AS courts_total
  FROM band GROUP BY club_id
),
sibling_same_band AS (  -- identical band on another court of the same club (copy / bulk edit)
  SELECT a.court_id, COUNT(DISTINCT b2.court_id) AS siblings_with_identical_band
  FROM band a
  JOIN band b2 ON b2.club_id = a.club_id AND b2.court_id <> a.court_id
              AND b2.band_start = a.band_start AND b2.band_end = a.band_end
              AND b2.band_price = a.band_price
  GROUP BY a.court_id
),
sibling_base AS (       -- band price equals another court's base price in the same club
  SELECT a.court_id, a.band_start, string_agg(DISTINCT s."nameFa", ', ') AS sibling_courts
  FROM band a JOIN "Court" s ON s."clubId" = a.club_id AND s.id <> a.court_id AND s.price = a.band_price
  GROUP BY a.court_id, a.band_start
),
slot_evidence AS (      -- earliest/latest slot in the band window priced at the band price
  SELECT a.court_id, a.band_start,
         MIN(sl.date) AS first_slot_date_at_band_price,
         MAX(sl.date) AS last_slot_date_at_band_price,
         COUNT(bk.id) AS bookings_at_band_price
  FROM band a
  JOIN "Slot" sl ON sl."courtId" = a.court_id
               AND sl."startTime" >= a.band_start AND sl."startTime" < a.band_end
               AND sl.price = a.band_price
  LEFT JOIN "Booking" bk ON bk."slotId" = sl.id
  GROUP BY a.court_id, a.band_start
)
SELECT
  cl.slug                         AS club_slug,
  cl."nameFa"                     AS club_name,
  band.court_name,
  band.base_price,
  band.band_start || '–' || band.band_end AS band_window,
  band.band_price,
  ROUND(band.band_price::numeric / NULLIF(band.base_price,0), 2) AS band_to_base_ratio,
  band.last_minute_on, band.last_minute_pct,
  cb.courts_with_bands || '/' || cb.courts_total AS club_courts_with_bands,
  COALESCE(ss.siblings_with_identical_band, 0) AS siblings_with_identical_band,
  sb.sibling_courts               AS band_price_equals_base_of,
  se.first_slot_date_at_band_price, se.last_slot_date_at_band_price, COALESCE(se.bookings_at_band_price,0) AS bookings_at_band_price,
  -- heuristic flags (any TRUE = ask the owner)
  (band.band_label = '')                                         AS flag_unlabeled_default_band,
  (band.band_price > band.base_price * 3 OR band.band_price * 3 < band.base_price) AS flag_band_far_from_base,
  (band.band_price = band.base_price)                             AS flag_price_neutral_band,
  (sb.sibling_courts IS NOT NULL)                                 AS flag_band_equals_sibling_base,
  (COALESCE(ss.siblings_with_identical_band,0) > 0)              AS flag_copied_to_siblings,
  (cb.courts_with_bands < cb.courts_total)                        AS flag_only_some_courts
FROM band
JOIN "Club" cl            ON cl.id = band.club_id
JOIN club_bands cb        ON cb.club_id = band.club_id
LEFT JOIN sibling_same_band ss ON ss.court_id = band.court_id
LEFT JOIN sibling_base sb ON sb.court_id = band.court_id AND sb.band_start = band.band_start
LEFT JOIN slot_evidence se ON se.court_id = band.court_id AND se.band_start = band.band_start
ORDER BY flag_band_far_from_base DESC, cl.slug, band.court_name, band.band_start;

-- (2) READ-ONLY timeline for one club: per court and date, the slot prices inside vs
-- outside its current bands. Shows roughly when the base price changed (e.g. IUST
-- court 3: 480,000 -> 5,000) while the band kept the old 480,000.
SELECT c."nameFa" AS court, sl.date,
       array_agg(DISTINCT sl.price ORDER BY sl.price) FILTER (WHERE sl."startTime" >= '20:00') AS prices_from_20,
       array_agg(DISTINCT sl.price ORDER BY sl.price) FILTER (WHERE sl."startTime" <  '20:00') AS prices_before_20
FROM "Slot" sl
JOIN "Court" c ON c.id = sl."courtId"
JOIN "Club" cl ON cl.id = c."clubId"
WHERE cl.slug = 'iust-tennis'
GROUP BY c."nameFa", sl.date
ORDER BY c."nameFa", sl.date;
