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
  void locale

  const normalized = email?.trim().toLowerCase()
  // FA-only launch: never redirect to /en/*
  const stamp = `ts=${Date.now()}`

  if (!normalized || !password) {
    return sendRedirect(event, `/login?error=invalid`)
  }

  if (process.env.NODE_ENV === 'production' && isDemoEmail(normalized)) {
    return sendRedirect(event, `/login?error=invalid`)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !user.passwordHash || !verifySecret(password, user.passwordHash)) {
      const errorCode = user && !user.passwordHash ? 'useGoogle' : 'invalid'
      return sendRedirect(event, `/login?error=${errorCode}`)
    }
    if (user.disabledAt) {
      return sendRedirect(event, `/login?error=disabled`)
    }

    await setUserSession(event, { user: toSessionUser(user) })

    const target = postLoginRedirectPath(user, 'fa', returnTo)
    const separator = target.includes('?') ? '&' : '?'
    return sendRedirect(event, `${target}${separator}${stamp}`)
  } catch {
    return sendRedirect(event, `/login?error=server`)
  }
})
