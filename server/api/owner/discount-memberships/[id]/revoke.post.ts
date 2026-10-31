import { revokeDiscountMembership } from '../../../utils/discountMemberships'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing membership id' })
  return revokeDiscountMembership({ membershipId: id, clubId: club.id })
})
