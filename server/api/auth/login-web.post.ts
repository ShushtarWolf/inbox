import { toSessionUser, postLoginRedirectPath } from '../../utils/auth'
import { verifySecret } from '../../utils/password'
import { readFormData } from 'h3'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:login-web')
  const form = await readFormData(event)
  const email = form.get('email')?.toString()
  const password = form.get('password')?.toString()
  const locale = form.get('locale')?.toString()
  const returnTo = form.get('returnTo')?.toString()

  const normalized = email?.trim().toLowerCase()
  const base = locale === 'en' ? '/en' : ''
  const stamp = `ts=${Date.now()}`

  if (!normalized || !password) {
    return sendRedirect(event, `${base}/login?error=invalid`)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !user.passwordHash || !verifySecret(password, user.passwordHash)) {
      const errorCode = user && !user.passwordHash ? 'oauth' : 'invalid'
      return sendRedirect(event, `${base}/login?error=${errorCode}`)
    }

    await setUserSession(event, { user: toSessionUser(user) })

    const target = postLoginRedirectPath(user, locale, returnTo)
    const separator = target.includes('?') ? '&' : '?'
    return sendRedirect(event, `${target}${separator}${stamp}`)
  } catch {
    return sendRedirect(event, `${base}/login?error=server`)
  }
})
