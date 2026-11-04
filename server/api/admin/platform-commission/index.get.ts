import { buildPlatformCommissionAdminView } from '../../../utils/platformCommission.ts'

/** Current platform default commission + change history (admin secret). */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  return buildPlatformCommissionAdminView()
})
