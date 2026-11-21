/**
 * IB-47 — one-off + batch repair for fully-cancelled season primary IPG residual shortfall.
 * Reuses sweepSeasonPrimaryResidualIfFullyCancelled (PR #186) — REFUND_CREDIT + settlement clawback.
 *
 *   node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 *   APPLY=yes node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 *   APPLY=yes PAYMENT_ID=cmwhw6oye00rsnr33m065fwhu node --import tsx scripts/repair/ib47-season-residual-shortfall-apply.ts
 */
import { sweepSeasonPrimaryResidualIfFullyCancelled } from '../../server/utils/ownerSeriesCancel.ts'
import { prisma } from '../../server/utils/prisma.ts'

const APPLY = process.env.APPLY === 'yes'
const PAYMENT_ID = (process.env.PAYMENT_ID || '').trim()

type Candidate = {
  paymentId: string
  seasonBookingId: string
  clubId: string
  residualOwed: number
  primaryBookingId: string | null
}

async function listCandidates(): Promise<Candidate[]> {
  const paymentFilter = PAYMENT_ID ? `AND p.id = $1` : ''
  const rows = await prisma.$queryRawUnsafe<Candidate[]>(`
    WITH series_pay AS (
      SELECT
        p.id AS "paymentId",
        COALESCE(p."metadataJson"::jsonb ->> 'seasonBookingId', '') AS "seasonBookingId",
        p."bookingId" AS "primaryBookingId",
        p.amount,
        p.status AS payment_status,
        COALESCE((p."metadataJson"::jsonb ->> 'sessionRefundsTotal')::bigint, 0) AS session_refunds_total,
        COALESCE(p."metadataJson"::jsonb ->> 'seriesResidualSettledAt', '') AS residual_settled_at,
        cl.id AS "clubId",
        EXISTS (
          SELECT 1 FROM "WalletTransaction" wt
          WHERE wt."paymentId" = p.id
            AND wt.type = 'REFUND_CREDIT'
            AND wt.note LIKE '%series-primary-residual%'
        ) AS has_residual_refund_row
      FROM "Payment" p
      LEFT JOIN "Booking" pb ON pb.id = p."bookingId"
      LEFT JOIN "Slot" s ON s.id = pb."slotId"
      LEFT JOIN "Court" c ON c.id = s."courtId"
      LEFT JOIN "Club" cl ON cl.id = c."clubId"
      WHERE p.amount > 0
        AND p.method = 'IPG'
        AND p.status = 'PAID'
        AND p."metadataJson"::jsonb ? 'seasonBookingId'
        ${paymentFilter}
    ),
    active AS (
      SELECT
        sp."paymentId",
        (
          SELECT count(DISTINCT b.id)::int
          FROM (
            SELECT e."bookingId" AS booking_id
            FROM "ReservationEvent" e
            WHERE sp."seasonBookingId" <> ''
              AND e."metadataJson" LIKE '%' || sp."seasonBookingId" || '%'
            UNION
            SELECT pay."bookingId"
            FROM "Payment" pay
            WHERE sp."seasonBookingId" <> ''
              AND pay."metadataJson" LIKE '%' || sp."seasonBookingId" || '%'
              AND pay."bookingId" IS NOT NULL
            UNION
            SELECT sp."primaryBookingId"
            WHERE sp."primaryBookingId" IS NOT NULL
          ) refs
          JOIN "Booking" b ON b.id = refs.booking_id
          WHERE b.status <> 'CANCELLED'
        ) AS active_sessions
      FROM series_pay sp
    )
    SELECT
      sp."paymentId",
      sp."seasonBookingId",
      sp."clubId",
      sp."primaryBookingId",
      GREATEST(0, sp.amount - sp.session_refunds_total)::int AS "residualOwed"
    FROM series_pay sp
    LEFT JOIN active a ON a."paymentId" = sp."paymentId"
    WHERE sp.session_refunds_total > 0
      AND sp.session_refunds_total < sp.amount
      AND COALESCE(a.active_sessions, 0) = 0
      AND NOT sp.has_residual_refund_row
      AND sp.residual_settled_at = ''
      AND sp."seasonBookingId" <> ''
      AND sp."clubId" IS NOT NULL
    ORDER BY "residualOwed" DESC
  `, ...(PAYMENT_ID ? [PAYMENT_ID] : []))

  return rows
}

const candidates = await listCandidates()
const dryRunLines = candidates.map((row) => ({
  paymentId: row.paymentId,
  seasonBookingId: row.seasonBookingId,
  clubId: row.clubId,
  proposedWalletCredit: row.residualOwed,
  repairNote: `series-primary-residual:${row.paymentId}`,
  action: APPLY ? 'apply' : 'dry-run',
}))

const applied: Array<{ paymentId: string, seasonBookingId: string, amount: number, ok: boolean, error?: string }> = []

if (APPLY) {
  for (const row of candidates) {
    try {
      const fresh = await listCandidates()
      const still = fresh.find((c) => c.paymentId === row.paymentId && c.seasonBookingId === row.seasonBookingId)
      if (!still || still.residualOwed !== row.residualOwed) {
        applied.push({
          paymentId: row.paymentId,
          seasonBookingId: row.seasonBookingId,
          amount: 0,
          ok: false,
          error: 'dry_run_conditions_changed',
        })
        continue
      }
      const result = await sweepSeasonPrimaryResidualIfFullyCancelled({
        clubId: row.clubId,
        seasonBookingId: row.seasonBookingId,
        reason: 'ib47-historical-season-residual-repair',
      })
      const amount = result?.amount ?? 0
      applied.push({
        paymentId: row.paymentId,
        seasonBookingId: row.seasonBookingId,
        amount,
        ok: amount > 0,
        skipped: result === null && amount === 0,
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      applied.push({
        paymentId: row.paymentId,
        seasonBookingId: row.seasonBookingId,
        amount: 0,
        ok: false,
        error: message.slice(0, 500),
      })
    }
  }
}

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  candidateCount: candidates.length,
  proposedWalletCreditToman: candidates.reduce((sum, row) => sum + row.residualOwed, 0),
  dryRunLines,
  applied,
}, null, 2))

await prisma.$disconnect()