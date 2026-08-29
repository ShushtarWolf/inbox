import { assertPackagesEnabled } from '../../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveCoachClubLink } from '../../../../utils/coachClubLinks'
import { publishPackageDraft } from '../../../../utils/packages'

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
  await requireActiveCoachClubLink(coach.id, pkg.clubId)

  return publishPackageDraft({
    packageId: pkg.id,
    clubId: pkg.clubId,
    actorUserId: user.id,
  })
})
