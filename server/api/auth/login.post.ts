import { normalizeIranPhone } from '#shared/phone.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:login')
  const { email, password, returnTo, locale } = await readBody<{
    email?: string
    password?: string
    returnTo?: string
    locale?: string
  }>(event)
  const identifier = email?.trim()
  if (!identifier || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  const normalizedEmail = identifier.toLowerCase()
  if (!normalizeIranPhone(identifier)) {
    rejectDemoEmailInProduction(normalizedEmail)
  }
  const user = await findUserForPasswordLogin(identifier)
  // Same message for missing user, wrong password, or Google-only accounts (no enumeration).
  if (!user || !user.passwordHash || !verifySecret(password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  if (user.disabledAt) {
    throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
  }
  await setUserSession(event, { user: toSessionUser(user) })
  await touchLastLogin(user.id)
  const redirectTo = postLoginRedirectPath(user, locale, returnTo)
  const { coachProfile, ...rest } = user
  return {
    id: rest.id,
    email: rest.email,
    name: rest.name,
    nameEn: rest.nameEn,
    role: rest.role,
    locale: rest.locale,
    avatarUrl: rest.avatarUrl || coachProfile?.photo || null,
    redirectTo,
  }
})
