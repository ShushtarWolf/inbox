import {
  approveDiscountApplication,
  rejectDiscountApplication,
} from '../../../../utils/discountMemberships'

export default defineEventHandler(async (event) => {
  const { club, user } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing application id' })

  const body = await readBody<{ action?: string; reason?: string | null }>(event)
  const action = String(body?.action || '').toLowerCase()
  if (action === 'approve') {
    return approveDiscountApplication({
      applicationId: id,
      clubId: club.id,
      reviewerId: user.id,
    })
  }
  if (action === 'reject') {
    return rejectDiscountApplication({
      applicationId: id,
      clubId: club.id,
      reviewerId: user.id,
      reason: body?.reason,
    })
  }
  throw createError({ statusCode: 400, statusMessage: 'action must be approve or reject' })
})
