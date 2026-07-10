export default defineEventHandler(async (event) => {
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
  const user = await prisma.user.findUnique({ where: { email: normalized } })
  if (!user || !verifySecret(password, user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  await setUserSession(event, { user: toSessionUser(user) })
  const redirectTo = postLoginRedirectPath(user, locale, returnTo)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    redirectTo,
  }
})
