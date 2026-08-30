import { assertPackagesEnabled } from '../../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveClub } from '../../../../utils/coachClubLinks'
import { cancelPackageDraft } from '../../../../utils/packages'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const pkg = await prisma.packageDraft.findFirst({
    where: { id, coachId: coach.id },
  })
  if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  await requireActiveClub(pkg.clubId)

  return cancelPackageDraft({ packageId: pkg.id, clubId: pkg.clubId })
})
