import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { iranPhoneStorageVariants, normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { canAddRole, hasRole, type PlatformRole } from '#shared/roles.ts'
import { userNameFieldsFromParts } from '#shared/userName.ts'
import type { User } from '@prisma/client'
import { isUniqueConstraintError } from './prismaErrors'

/** Lookup by normalized phone and legacy storage variants (never club-owner provision). */
export async function findExistingUserByPhoneVariants(phone: string): Promise<User | null> {
  const variants = iranPhoneStorageVariants(phone)
  if (!variants.length) return null
  const phoneUsers = await prisma.user.findMany({
    where: { phone: { in: variants } },
    orderBy: { createdAt: 'asc' },
  })
  if (!phoneUsers.length) return null
  if (phoneUsers.length > 1) {
    console.error('[phoneAuth] multiple User rows match phone variants', {
      normalized: phone,
      userIds: phoneUsers.map((u) => u.id),
    })
  }
  return phoneUsers.find((u) => u.phone === phone) ?? phoneUsers[0]!
}

const DESK_ATHLETE_NAME_FALLBACK = 'ورزشکار'

/**
 * Create or resolve an ATHLETE user for a valid Iranian mobile (owner desk bookings).
 * Does not overwrite existing users. Links orphan desk bookings when a user is resolved.
 */
export async function ensureAthleteUserByPhone(
  phoneRaw: string | null | undefined,
  opts?: { name?: string | null; nameFamily?: string | null },
): Promise<User | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null

  const existing = await findExistingUserByPhoneVariants(phone)
  if (existing) {
    await linkOrphanBookingsByPhone(existing.id, phone).catch((err) => {
      console.error('[phoneAuth] linkOrphanBookingsByPhone failed for existing user', err)
    })
    return existing
  }

  const guestPair = normalizeGuestNamePair(opts?.name, opts?.nameFamily)
  const nameParts = guestPair.guestName.trim()
    ? userNameFieldsFromParts(guestPair.guestName, guestPair.guestFamily)
    : userNameFieldsFromParts(DESK_ATHLETE_NAME_FALLBACK, null)
  const email = phoneToSyntheticEmail(phone)

  try {
    const user = await prisma.user.create({
      data: {
        phone,
        email,
        role: 'ATHLETE',
        locale: 'fa',
        name: nameParts.name,
        nameFamily: nameParts.nameFamily,
        nameEn: nameParts.nameEn,
        phoneVerifiedAt: null,
      },
    })
    await linkOrphanBookingsByPhone(user.id, phone)
    return user
  }
  catch (err) {
    if (!isUniqueConstraintError(err)) throw err
    const raced = await findExistingUserByPhoneVariants(phone)
    if (raced) {
      await linkOrphanBookingsByPhone(raced.id, phone).catch(() => {})
      return raced
    }
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      await linkOrphanBookingsByPhone(byEmail.id, phone).catch(() => {})
      return byEmail
    }
    throw err
  }
}

/**
 * Owner desk flows: ensure athlete account without failing the booking on unexpected errors.
 */
export async function ensureAthleteUserForOwnerDesk(
  phoneRaw: string | null | undefined,
  opts?: { name?: string | null; nameFamily?: string | null },
): Promise<User | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null
  try {
    return await ensureAthleteUserByPhone(phoneRaw, opts)
  }
  catch (err) {
    console.error('[phoneAuth] ensureAthleteUserByPhone failed; desk booking continues without user link', err)
    const fallback = await findExistingUserByPhoneVariants(phone)
    if (fallback) {
      await linkOrphanBookingsByPhone(fallback.id, phone).catch(() => {})
    }
    return fallback
  }
}

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

  const variants = iranPhoneStorageVariants(phone)
  const phoneUsers = variants.length
    ? await prisma.user.findMany({
        where: { phone: { in: variants } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  if (phoneUsers.length > 1) {
    console.error('[phoneAuth] multiple User rows match phone variants for OTP login', {
      normalized: phone,
      userIds: phoneUsers.map((u) => u.id),
    })
  }

  const byPhone = phoneUsers.length === 1
    ? phoneUsers[0]!
    : phoneUsers.find((u) => u.phone === phone) ?? phoneUsers[0]

  if (byPhone) {
    const needsPhoneNormalize = byPhone.phone !== phone
    return { user: byPhone, linkPhone: needsPhoneNormalize, phone }
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
  const existing = await findExistingUserByPhoneVariants(phone)
  return Boolean(existing)
}

/** Resolve registered user id+name when the mobile matches User.phone. */
export async function findUserByPhone(
  phoneRaw: string | null | undefined,
): Promise<{ id: string; name: string | null; nameFamily: string | null } | null> {
  const phone = normalizeIranPhone(phoneRaw)
  if (!phone) return null
  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, name: true, nameFamily: true },
  })
  return existing
}

/** Batch lookup for season list / desk flows (keys are normalized User.phone). */
export async function findUsersByPhones(
  phones: Array<string | null | undefined>,
): Promise<Map<string, { name: string | null; nameFamily: string | null }>> {
  const normalized = [
    ...new Set(
      phones
        .map((p) => normalizeIranPhone(p))
        .filter((p): p is string => Boolean(p)),
    ),
  ]
  if (!normalized.length) return new Map()
  const users = await prisma.user.findMany({
    where: { phone: { in: normalized } },
    select: { phone: true, name: true, nameFamily: true },
  })
  const map = new Map<string, { name: string | null; nameFamily: string | null }>()
  for (const user of users) {
    if (user.phone) map.set(user.phone, { name: user.name, nameFamily: user.nameFamily })
  }
  return map
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
 * Find an existing phone user who can still accept `role` as another platform role.
 * Returns null when the phone is free, already has the role, or already has three roles.
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
