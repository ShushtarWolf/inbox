import { assertPackagesEnabled } from '../../../../utils/packagesGate'
import { publishPackageDraft } from '../../../../utils/packages'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const { club, user } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  return publishPackageDraft({
    packageId: id,
    clubId: club.id,
    actorUserId: user.id,
  })
})
