import { requireAdminSecret } from '../../../utils/adminAuth'
import { approveShebaChangeRequest, rejectShebaChangeRequest, serializeShebaRequest } from '../../../utils/shebaChange'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const body = await readBody<{ action?: string; note?: string }>(event)
  const action = body.action?.trim()
  if (action !== 'approve' && action !== 'reject') {
    throw createError({ statusCode: 400, statusMessage: 'action must be approve or reject' })
  }

  const note = typeof body.note === 'string' ? body.note.trim() || undefined : undefined
  const updated = action === 'approve'
    ? await approveShebaChangeRequest(id, note)
    : await rejectShebaChangeRequest(id, note)

  return { request: serializeShebaRequest(updated) }
})
