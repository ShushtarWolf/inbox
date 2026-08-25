import { adminDeleteUserById } from '../../../utils/adminDeleteUser'

/**
 * DELETE /api/admin/users/:id
 * Header: x-admin-secret
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  return adminDeleteUserById(id)
})
