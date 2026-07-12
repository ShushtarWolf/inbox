export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:register')
  const body = await readBody<{ name?: string; email?: string; password?: string; locale?: string }>(event)
  const name = body.name?.trim()
  const email = body.email?.trim().toLowerCase()
  const password = body.password ?? ''

  if (!name || !email || password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (!existing.passwordHash && existing.oauthProvider) {
      throw createError({ statusCode: 409, statusMessage: 'Use Google sign-in for this account' })
    }
    throw createError({ statusCode: 409, statusMessage: 'Email already registered' })
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: 'ATHLETE',
      passwordHash: hashSecret(password),
      locale: body.locale === 'en' ? 'en' : 'fa',
    },
  })

  await setUserSession(event, { user: toSessionUser(user) })
  return { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale }
})
