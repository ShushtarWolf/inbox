import { scanSeriesOverCreditInventory } from '../../../utils/scanSeriesOverCreditInventory'

/** Dry-run series over-credit inventory (read-only). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const limit = query.limit != null ? Number(query.limit) : undefined
  const onlyOver = query.onlyOver === '0' || query.onlyOver === 'false' ? false : true
  const inventory = await scanSeriesOverCreditInventory({ limit, onlyOver })
  return { dryRun: true, inventory }
})