/**
 * Phase 3 — historical cancel refund inventory (DRY RUN ONLY).
 *
 *   node --import tsx scripts/inventory-cancel-refund-gaps.ts
 *   TRACKING=1541908 CLUB_SLUG=iust-tennis node --import tsx scripts/inventory-cancel-refund-gaps.ts
 *
 * Buckets: credit | skip | review | series_gap
 * Does not accept APPLY — use repair-historical-cancel-refunds.ts only after ops review.
 */
import { runPhase3CancelRefundInventory } from '../server/utils/historicalCancelRefundRepair.ts'

if (process.env.APPLY === 'yes') {
  console.error('[inventory-cancel-refund-gaps] APPLY is not supported. Dry-run only.')
  process.exit(1)
}

const TRACKING = (process.env.TRACKING || '').trim()
const CLUB_SLUG = (process.env.CLUB_SLUG || '').trim()

const report = await runPhase3CancelRefundInventory({
  tracking: TRACKING || undefined,
  clubSlug: CLUB_SLUG || undefined,
})

console.log(JSON.stringify(report, null, 2))