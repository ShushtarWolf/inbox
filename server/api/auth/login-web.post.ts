import { toSessionUser, postLoginRedirectPath } from '../../utils/auth'
import { verifySecret } from '../../utils/password'

export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'auth:login-web')
  const { email, password, locale, returnTo } = await readBody<{
    email?: string
    password?: string
    locale?: string
    returnTo?: string
  }>(event)

  const normalized = email?.trim().toLowerCase()
  const base = locale === 'en' ? '/en' : ''
  const stamp = `ts=${Date.now()}`

  if (!normalized || !password) {
    return sendRedirect(event, `${base}/login?error=invalid`)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !verifySecret(password, user.passwordHash)) {
      return sendRedirect(event, `${base}/login?error=invalid`)
    }

    await setUserSession(event, { user: toSessionUser(user) })

    const target = postLoginRedirectPath(user, locale, returnTo)
    const separator = target.includes('?') ? '&' : '?'
    return sendRedirect(event, `${target}${separator}${stamp}`)
  } catch {
    return sendRedirect(event, `${base}/login?error=server`)
  }
})
