import type { DayTimeRange } from '#shared/recurringSessions.ts'
import { normalizeAccessAreas, normalizeWorkerPosition } from '#shared/workerAccess.ts'
import {
  mapWorkerRecord,
  parseWorkingHours,
  serializeAccessAreas,
  serializeWorkingHours,
} from '~/server/utils/workers'

export default defineEventHandler(async (event) => {
  const { club, membership } = await requireOwnerClub(event, 'settings')
  requireClubOwner(membership)
  const body = await readBody<{
    firstName?: string
    lastName?: string
    mobile?: string
    emergencyMobile?: string
    position?: string
    accessAreas?: string[]
    workingHours?: Record<string, DayTimeRange>
  }>(event)

  const firstName = body.firstName?.trim()
  const lastName = body.lastName?.trim()
  const mobile = body.mobile?.trim()
  if (!firstName || !lastName || !mobile) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const position = normalizeWorkerPosition(body.position)
  const accessAreas = normalizeAccessAreas(body.accessAreas || [])
  const workingHours = parseWorkingHours(JSON.stringify(body.workingHours || {}))

  const worker = await prisma.clubWorker.create({
    data: {
      clubId: club.id,
      firstName,
      lastName,
      mobile,
      emergencyMobile: body.emergencyMobile?.trim() || null,
      position,
      workingHoursJson: serializeWorkingHours(workingHours),
      accessAreasJson: serializeAccessAreas(accessAreas),
    },
  })

  return mapWorkerRecord(worker)
})
