import { getPaymentsStatusSnapshot } from '#shared/payments.ts'

/** Safe payments diagnostics — never returns SEP_TERMINAL_ID or secrets. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const snapshot = getPaymentsStatusSnapshot()
  return {
    ok: true,
    ...snapshot,
  }
})
