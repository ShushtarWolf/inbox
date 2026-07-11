export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'auth:login')
  const { email, password, returnTo, locale } = await readBody<{
    email?: string
    password?: string
    returnTo?: string
    locale?: string
  }>(event)
  const normalized = email?.trim().toLowerCase()
  if (!normalized || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { coachProfile: { select: { photo: true } } },
  })
  if (!user || !user.passwordHash || !verifySecret(password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: user && !user.passwordHash ? 'Use Google sign-in for this account' : 'Invalid credentials' })
  }
  await setUserSession(event, { user: toSessionUser(user) })
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
