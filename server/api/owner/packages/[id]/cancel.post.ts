import { assertPackagesEnabled } from '../../../../utils/packagesGate'
import { cancelPackageDraft } from '../../../../utils/packages'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  return cancelPackageDraft({ packageId: id, clubId: club.id })
})
