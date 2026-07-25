/**
 * Athlete password registration (MVP launch path while Kavenegar OTP is gated).
 * OTP register via /api/auth/otp/* remains for when SMS goes live.
 */
import { resolvePasswordRegisterIdentity, isPasswordLongEnough } from '#shared/passwordAuth.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:register')
  const body = await readBody<{
    name?: string
    email?: string
    phone?: string
    password?: string
    locale?: string
    returnTo?: string
  }>(event)

  const name = body.name?.trim()
  const password = body.password ?? ''
  const identity = resolvePasswordRegisterIdentity({
    phone: body.phone,
    email: body.email,
  })

  if (!name || !identity || !isPasswordLongEnough(password)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  rejectDemoEmailInProduction(identity.email)

  const existingEmail = await prisma.user.findUnique({ where: { email: identity.email } })
  if (existingEmail) {
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }
  if (identity.phone) {
    const phoneTaken = await prisma.user.findUnique({ where: { phone: identity.phone } })
    if (phoneTaken) {
      throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
    }
  }

  const locale = body.locale === 'en' ? 'en' : 'fa'
  const user = await prisma.user.create({
    data: {
      name,
      nameEn: name,
      email: identity.email,
      role: 'ATHLETE',
      passwordHash: hashSecret(password),
      locale,
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
    locale: user.locale,
    phone: user.phone,
    redirectTo: postLoginRedirectPath(user, locale, body.returnTo),
  }
})
