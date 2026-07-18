import { toSessionUser, postLoginRedirectPath, touchLastLogin } from '../../utils/auth'
import { verifySecret } from '../../utils/password'
import { demoAuthAllowed, isDemoEmail } from '../../utils/demo'
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

  if (process.env.NODE_ENV === 'production' && isDemoEmail(normalized) && !demoAuthAllowed()) {
    return sendRedirect(event, `/login?error=invalid`)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    // Same error for missing user, wrong password, or Google-only accounts (no enumeration).
    if (!user || !user.passwordHash || !verifySecret(password, user.passwordHash)) {
      return sendRedirect(event, `/login?error=invalid`)
    }
    if (user.disabledAt) {
      return sendRedirect(event, `/login?error=disabled`)
    }

    await setUserSession(event, { user: toSessionUser(user) })
    await touchLastLogin(user.id)

    const target = postLoginRedirectPath(user, 'fa', returnTo)
    const separator = target.includes('?') ? '&' : '?'
    return sendRedirect(event, `${target}${separator}${stamp}`)
  } catch {
    return sendRedirect(event, `/login?error=server`)
  }
})
