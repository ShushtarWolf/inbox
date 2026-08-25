import { adminDeleteUserByPhone } from '../../../utils/adminDeleteUser'

const CONFIRM = 'DELETE_USER'

/**
 * POST /api/admin/users/purge-by-phone
 * Header: x-admin-secret
 * Body: { phone: "09…", confirm: "DELETE_USER" }
 *
 * Removes the account so the phone can register again (e.g. athlete → coach signup).
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const body = await readBody<{ phone?: string; confirm?: string }>(event)
  if (body.confirm !== CONFIRM) {
    throw createError({
      statusCode: 400,
      statusMessage: `confirm must be ${CONFIRM}`,
    })
  }
  if (!body.phone?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'phone is required' })
  }

  return adminDeleteUserByPhone(body.phone.trim())
})
