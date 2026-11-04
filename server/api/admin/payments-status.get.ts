import { getPaymentsStatusSnapshot } from '#shared/payments.ts'
import { loadPlatformCommissionBps } from '../../utils/platformCommission.ts'

/** Safe payments diagnostics — never returns SEP_TERMINAL_ID or secrets. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const platformCommissionBps = await loadPlatformCommissionBps()
  const snapshot = getPaymentsStatusSnapshot({ platformCommissionBps })
  return {
    ok: true,
    platformCommissionBps,
    platformCommissionSource: 'database',
    ...snapshot,
  }
})
