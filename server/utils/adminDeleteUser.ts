import { createError } from 'h3'
import { iranPhoneStorageVariants, normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'
import { prisma } from './prisma'

export type AdminDeleteUserResult = {
  deleted: true
  id: string
  phone: string | null
  email: string
  role: string
  otpDeleted: number
}

/**
 * Fully remove a user so their phone/email can re-register.
 * Detaches club ownership / coach link first (FK defaults are Restrict).
 * Refuses when the user still owns clubs — reassign ownership first.
 */
export async function adminDeleteUserById(userId: string): Promise<AdminDeleteUserResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      email: true,
      role: true,
      ownedClubs: { select: { id: true, slug: true }, take: 5 },
      coachProfile: { select: { id: true } },
    },
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  if (user.ownedClubs.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `User owns clubs (${user.ownedClubs.map((c) => c.slug).join(', ')}); reassign ownership first`,
    })
  }

  if (user.coachProfile?.id) {
    await prisma.coach.update({
      where: { id: user.coachProfile.id },
      data: { userId: null },
    })
  }

  const phoneVariants = iranPhoneStorageVariants(user.phone)
  let otpDeleted = 0
  if (phoneVariants.length) {
    const otps = await prisma.phoneOtp.deleteMany({ where: { phone: { in: phoneVariants } } })
    otpDeleted = otps.count
  }

  await prisma.user.delete({ where: { id: user.id } })

  return {
    deleted: true,
    id: user.id,
    phone: user.phone,
    email: user.email,
    role: user.role,
    otpDeleted,
  }
}

export async function adminDeleteUserByPhone(rawPhone: string): Promise<AdminDeleteUserResult> {
  const phone = normalizeIranPhone(rawPhone)
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }
  const variants = iranPhoneStorageVariants(phone)
  const email = phoneToSyntheticEmail(phone)
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ phone: { in: variants } }, { email }],
    },
    select: { id: true },
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }
  return adminDeleteUserById(user.id)
}
