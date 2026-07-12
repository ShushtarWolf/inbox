import type { DayTimeRange } from '#shared/recurringSessions.ts'
import { normalizeAccessAreas, normalizeWorkerPosition, parseAccessAreas } from '#shared/workerAccess.ts'
import {
  mapWorkerRecord,
  parseWorkingHours,
  serializeAccessAreas,
  serializeWorkingHours,
} from '../../../utils/workers'

export default defineEventHandler(async (event) => {
  const { club, membership } = await requireOwnerClub(event, 'settings')
  requireClubOwner(membership)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })

  const existing = await prisma.clubWorker.findFirst({
    where: { id, clubId: club.id, active: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const body = await readBody<{
    firstName?: string
    lastName?: string
    mobile?: string
    emergencyMobile?: string | null
    position?: string
    accessAreas?: string[]
    workingHours?: Record<string, DayTimeRange>
  }>(event)

  const firstName = body.firstName?.trim() || existing.firstName
  const lastName = body.lastName?.trim() || existing.lastName
  const mobile = body.mobile?.trim() || existing.mobile
  const position = body.position ? normalizeWorkerPosition(body.position) : normalizeWorkerPosition(existing.position)
  const accessAreas = body.accessAreas
    ? normalizeAccessAreas(body.accessAreas)
    : parseAccessAreas(existing.accessAreasJson)
  const workingHours = body.workingHours
    ? parseWorkingHours(JSON.stringify(body.workingHours))
    : parseWorkingHours(existing.workingHoursJson)

  const worker = await prisma.clubWorker.update({
    where: { id },
    data: {
      firstName,
      lastName,
      mobile,
      emergencyMobile: body.emergencyMobile !== undefined
        ? (body.emergencyMobile?.trim() || null)
        : existing.emergencyMobile,
      position,
      workingHoursJson: serializeWorkingHours(workingHours),
      accessAreasJson: serializeAccessAreas(accessAreas),
    },
  })

  return mapWorkerRecord(worker)
})
