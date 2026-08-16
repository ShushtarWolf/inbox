import { normalizeIranPhone } from '#shared/phone.ts'
import { canAddRole, hasRole, type PlatformRole } from '#shared/roles.ts'
import type { User } from '@prisma/client'

/**
 * Resolve a user for phone OTP login.
 * Prefer User.phone; otherwise safely link a provisioned club owner whose Club.phone matches
 * and whose User.phone is still empty (or already equals the normalized mobile).
 */
export async function findUserForPhoneOtp(phoneRaw: string): Promise<{
  user: User
  linkPhone: boolean
  phone: string
} | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null

  const byPhone = await prisma.user.findUnique({ where: { phone } })
  if (byPhone) {
    return { user: byPhone, linkPhone: false, phone }
  }

  const club = await prisma.club.findFirst({
    where: { phone },
    include: { owner: true },
    orderBy: { createdAt: 'asc' },
  })
  const owner = club?.owner
  if (!owner || !hasRole(owner, 'CLUB_ADMIN')) return null
  // Do not steal a phone already claimed on another identity shape
  if (owner.phone && owner.phone !== phone) return null

  return { user: owner, linkPhone: true, phone }
}

/** True when this phone already belongs to a user. */
export async function isPhoneRegistered(phoneRaw: string): Promise<boolean> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return false
  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  return Boolean(existing)
}

/**
 * Find an existing phone user who can still accept `role` as a second platform role.
 * Returns null when the phone is free, already has the role, or already has two roles.
 */
export async function findUserForAdditionalRole(
  phoneRaw: string,
  role: PlatformRole,
): Promise<User | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null
  const existing = await prisma.user.findUnique({ where: { phone } })
  if (!existing || existing.disabledAt) return null
  if (!canAddRole(existing, role)) return null
  return existing
}
