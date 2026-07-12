import type { DayTimeRange } from '#shared/recurringSessions.ts'
import { defaultPermissionsForRole, normalizePermissions } from '#shared/ownerPermissions.ts'
import {
  ensureWorkerLogin,
  mapWorkerRecord,
  normalizeWorkerRole,
  parseWorkingHours,
  serializeWorkingHours,
} from '~/server/utils/workers'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'team')
  const body = await readBody<{
    firstName?: string
    lastName?: string
    mobile?: string
    emergencyMobile?: string
    email?: string
    role?: string
    permissions?: string[]
    workingHours?: Record<string, DayTimeRange>
  }>(event)

  const firstName = body.firstName?.trim()
  const lastName = body.lastName?.trim()
  const mobile = body.mobile?.trim()
  if (!firstName || !lastName || !mobile) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const role = normalizeWorkerRole(body.role)
  const permissions = body.permissions?.length
    ? normalizePermissions(body.permissions)
    : defaultPermissionsForRole(role)
  const workingHours = parseWorkingHours(JSON.stringify(body.workingHours || {}))
  const email = body.email?.trim().toLowerCase() || null

  let membershipId: string | null = null
  let temporaryPassword: string | undefined

  if (email) {
    const login = await ensureWorkerLogin({
      clubId: club.id,
      email,
      firstName,
      lastName,
      mobile,
      role,
      permissions,
    })
    membershipId = login.membershipId
    temporaryPassword = login.temporaryPassword
  }

  const worker = await prisma.clubWorker.create({
    data: {
      clubId: club.id,
      firstName,
      lastName,
      mobile,
      emergencyMobile: body.emergencyMobile?.trim() || null,
      email,
      role,
      workingHoursJson: serializeWorkingHours(workingHours),
      permissionsJson: JSON.stringify(permissions),
      membershipId,
    },
  })

  return { ...mapWorkerRecord(worker), temporaryPassword }
})
