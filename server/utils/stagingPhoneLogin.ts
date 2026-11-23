import type { H3Event } from 'h3'
import type { User } from '@prisma/client'
import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { assignAddedRole, hasRole } from '#shared/roles.ts'
import { sanitizeReturnTo } from '#shared/returnTo.ts'
import { stagingPhoneLoginEnabled } from '#shared/stagingBoot.ts'
import { isUniqueConstraintError } from './prismaErrors'
import { linkOrphanBookingsByPhone } from './phoneAuth'
import { toSessionUser, touchLastLogin } from './auth'

export function resolveStagingPhoneLoginRedirect(returnTo?: string): string {
  return sanitizeReturnTo(returnTo) || '/athlete/open-match'
}

export async function upsertUserForStagingPhoneLogin(phone: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { phone } })
  const now = new Date()

  if (!existing) {
    try {
      return await prisma.user.create({
        data: {
          phone,
          email: phoneToSyntheticEmail(phone),
          name: 'کاربر استیجینگ',
          role: 'ATHLETE',
          gender: 'MALE',
          locale: 'fa',
          phoneVerifiedAt: now,
          lastLoginAt: now,
        },
      })
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const raced = await prisma.user.findUnique({ where: { phone } })
        if (raced) return refreshStagingPhoneUser(raced, now)
      }
      throw err
    }
  }

  if (existing.disabledAt) {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
  }

  return refreshStagingPhoneUser(existing, now)
}

async function refreshStagingPhoneUser(user: User, now: Date): Promise<User> {
  const rolePatch = hasRole(user, 'ATHLETE') ? null : assignAddedRole(user, 'ATHLETE')
  return prisma.user.update({
    where: { id: user.id },
    data: {
      ...(rolePatch ?? {}),
      phoneVerifiedAt: now,
      lastLoginAt: now,
    },
  })
}

export async function completeStagingPhoneLogin(
  event: H3Event,
  body: { phone?: string; returnTo?: string },
) {
  if (!stagingPhoneLoginEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const phone = normalizeIranPhone(body.phone || '')
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }

  const user = await upsertUserForStagingPhoneLogin(phone)
  await linkOrphanBookingsByPhone(user.id, phone)
  await touchLastLogin(user.id)
  await setUserSession(event, { user: toSessionUser(user) })

  const redirectTo = resolveStagingPhoneLoginRedirect(body.returnTo)

  return {
    ok: true as const,
    user: toSessionUser(user),
    redirectTo,
  }
}