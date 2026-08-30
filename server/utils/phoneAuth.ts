import { iranPhoneStorageVariants, normalizeIranPhone } from '#shared/phone.ts'
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

  // Club has no createdAt — order by id for deterministic oldest match.
  const club = await prisma.club.findFirst({
    where: { phone },
    include: { owner: true },
    orderBy: { id: 'asc' },
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

/** Resolve registered user id+name when the mobile matches User.phone. */
export async function findUserByPhone(
  phoneRaw: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null
  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true },
  })
  return existing
}

/** Link desk/guest bookings to a registered athlete when the mobile matches User.phone. */
export async function findUserIdByPhone(phoneRaw: string | null | undefined): Promise<string | null> {
  const existing = await findUserByPhone(phoneRaw)
  return existing?.id ?? null
}

/**
 * Attach orphan desk bookings (guestMobile set, userId null) to this user.
 * Matches common phone spellings so legacy rows still appear in My Bookings.
 */
export async function linkOrphanBookingsByPhone(
  userId: string,
  phoneRaw: string | null | undefined,
): Promise<number> {
  const variants = iranPhoneStorageVariants(phoneRaw)
  if (!variants.length) return 0
  const result = await prisma.booking.updateMany({
    where: { userId: null, guestMobile: { in: variants } },
    data: { userId },
  })
  return result.count
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
