import { toSessionUser } from '../../utils/auth'
import { verifySecret } from '../../utils/password'

export default defineEventHandler(async (event) => {
  const { email, password, locale } = await readBody<{
    email?: string
    password?: string
    locale?: string
  }>(event)

  const normalized = email?.trim().toLowerCase()
  const base = locale === 'en' ? '/en' : ''

  if (!normalized || !password) {
    return sendRedirect(event, `${base}/login?error=invalid`)
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !verifySecret(password, user.passwordHash)) {
      return sendRedirect(event, `${base}/login?error=invalid`)
    }

    await setUserSession(event, { user: toSessionUser(user) })

    const target = user.role === 'CLUB_ADMIN'
      ? `${base}/owner`
      : user.role === 'COACH'
        ? `${base}/coach`
        : `${base}/athlete`

    return sendRedirect(event, target)
  } catch {
    return sendRedirect(event, `${base}/login?error=server`)
  }
})
