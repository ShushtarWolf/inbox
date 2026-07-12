import { randomBytes } from 'node:crypto'
import type { StaffRole } from '@prisma/client'
import type { DayTimeRange } from '#shared/recurringSessions.ts'
import { defaultPermissionsForRole, normalizePermissions } from '#shared/ownerPermissions.ts'

export const WORKER_ROLES = new Set<StaffRole>(['MANAGER', 'ANALYST', 'FRONT_DESK'])
export const WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type WorkerWorkingHours = Record<string, DayTimeRange>

export function parseWorkingHours(json: string | null | undefined): WorkerWorkingHours {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: WorkerWorkingHours = {}
    for (const [day, range] of Object.entries(parsed)) {
      if (range && typeof range === 'object' && 'start' in range && 'end' in range) {
        const r = range as { start: unknown; end: unknown }
        if (typeof r.start === 'string' && typeof r.end === 'string') {
          result[day] = { start: r.start, end: r.end }
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

export function serializeWorkingHours(hours: WorkerWorkingHours): string {
  return JSON.stringify(hours)
}

export function normalizeWorkerRole(role?: string): StaffRole {
  if (role && WORKER_ROLES.has(role as StaffRole)) return role as StaffRole
  return 'FRONT_DESK'
}

export async function ensureWorkerLogin(params: {
  clubId: string
  email: string
  firstName: string
  lastName: string
  mobile: string
  role: StaffRole
  permissions: string[]
}) {
  const email = params.email.trim().toLowerCase()
  const fullName = `${params.firstName} ${params.lastName}`.trim()
  const permissions = normalizePermissions(params.permissions.length ? params.permissions : defaultPermissionsForRole(params.role))

  let user = await prisma.user.findUnique({ where: { email } })
  const tempPassword = randomBytes(12).toString('base64url')
  let createdPassword: string | undefined

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: fullName,
        nameEn: fullName,
        phone: params.mobile,
        role: 'CLUB_ADMIN',
        passwordHash: hashSecret(tempPassword),
      },
    })
    createdPassword = tempPassword
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        phone: params.mobile || user.phone,
        name: fullName || user.name,
        nameEn: fullName || user.nameEn,
      },
    })
  }

  const membership = await prisma.staffMembership.upsert({
    where: { userId_clubId_role: { userId: user.id, clubId: params.clubId, role: params.role } },
    create: {
      userId: user.id,
      clubId: params.clubId,
      role: params.role,
      permissionsJson: JSON.stringify(permissions),
      active: true,
    },
    update: {
      active: true,
      permissionsJson: JSON.stringify(permissions),
    },
  })

  return { membershipId: membership.id, temporaryPassword: createdPassword }
}

export function mapWorkerRecord(worker: {
  id: string
  firstName: string
  lastName: string
  mobile: string
  emergencyMobile: string | null
  email: string | null
  role: StaffRole
  workingHoursJson: string | null
  permissionsJson: string | null
  active: boolean
  createdAt: Date
  membershipId: string | null
}) {
  return {
    id: worker.id,
    firstName: worker.firstName,
    lastName: worker.lastName,
    mobile: worker.mobile,
    emergencyMobile: worker.emergencyMobile,
    email: worker.email,
    role: worker.role,
    workingHours: parseWorkingHours(worker.workingHoursJson),
    permissionsJson: worker.permissionsJson,
    active: worker.active,
    createdAt: worker.createdAt.toISOString(),
    hasLogin: Boolean(worker.membershipId),
  }
}
