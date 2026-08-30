/**
 * Athlete password registration (MVP launch path while Kavenegar OTP is gated).
 * OTP register via /api/auth/otp/* remains for when SMS goes live.
 */
import { parseGender } from '#shared/gender.ts'
import { resolvePasswordRegisterIdentity, isPasswordLongEnough } from '#shared/passwordAuth.ts'
import { assignAddedRole, canAddRole } from '#shared/roles.ts'
import { toSessionUser, touchLastLogin, ownerPostLoginRedirect } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:register')
  const body = await readBody<{
    name?: string
    email?: string
    phone?: string
    password?: string
    locale?: string
    gender?: string
    returnTo?: string
  }>(event)

  const name = body.name?.trim()
  const password = body.password ?? ''
  const gender = parseGender(body.gender)
  const identity = resolvePasswordRegisterIdentity({
    phone: body.phone,
    email: body.email,
  })

  if (!name || !identity || !isPasswordLongEnough(password) || !gender) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  rejectDemoEmailInProduction(identity.email)

  const existingByEmail = await prisma.user.findUnique({ where: { email: identity.email } })
  const existingByPhone = identity.phone
    ? await prisma.user.findUnique({ where: { phone: identity.phone } })
    : null
  if (existingByEmail && existingByPhone && existingByEmail.id !== existingByPhone.id) {
    throw createError({ statusCode: 409, statusMessage: 'Email and phone belong to different accounts' })
  }
  const existingUser = existingByEmail || existingByPhone
  if (existingUser && !canAddRole(existingUser, 'ATHLETE')) {
    throw createError({
      statusCode: 409,
      statusMessage: existingByEmail ? 'Email already registered' : 'Phone already registered',
    })
  }

  const locale = body.locale === 'en' ? 'en' : 'fa'
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          ...assignAddedRole(existingUser, 'ATHLETE')!,
          passwordHash: hashSecret(password),
          ...(identity.phone && !existingUser.phone ? { phone: identity.phone } : {}),
          ...(!existingUser.gender ? { gender } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          name,
          nameEn: name,
          email: identity.email,
          role: 'ATHLETE',
          passwordHash: hashSecret(password),
          locale,
          gender,
          phone: identity.phone,
          // Password-register phones are not SMS-verified until live OTP cutover.
          phoneVerifiedAt: null,
        },
      })

  await setUserSession(event, { user: toSessionUser(user) })
  await touchLastLogin(user.id)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    secondaryRole: user.secondaryRole,
    tertiaryRole: user.tertiaryRole,
    locale: user.locale,
    gender: user.gender,
    phone: user.phone,
    redirectTo: await ownerPostLoginRedirect(user, body.returnTo, event),
  }
})
