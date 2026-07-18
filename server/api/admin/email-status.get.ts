import { getEmailStatus } from '../../utils/email'

/** Safe email diagnostics — never returns SMTP_PASS or message bodies. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const status = getEmailStatus()
  return { ok: true, ...status }
})
