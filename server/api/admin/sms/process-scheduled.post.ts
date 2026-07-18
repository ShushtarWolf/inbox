import { processScheduledCampaigns } from '../../../utils/sms/scheduler'

/** Process due SCHEDULED SMS campaigns through the real SMS pipeline (log or live). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  await enforceRateLimit(event, 'admin:sms-process')
  const query = getQuery(event)
  const limitRaw = Number(query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20
  const result = await processScheduledCampaigns({ limit })
  return { ok: true, ...result }
})
