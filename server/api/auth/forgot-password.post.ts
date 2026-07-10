import { createHash, randomBytes } from 'node:crypto'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'auth:forgot-password')
  const { email } = await readBody<{ email?: string }>(event)
  const normalized = email?.trim().toLowerCase()

  if (normalized) {
    const user = await prisma.user.findUnique({ where: { email: normalized } })
    if (user) {
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
      })
      const base = process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      const resetUrl = `${base}/reset-password?token=${token}`
      if (process.env.EMAIL_ENABLED === 'true') {
        // Email provider integration point
        console.log('[email] password reset', { to: normalized, resetUrl })
      } else {
        console.log('[dev] password reset URL:', resetUrl)
      }
    }
  }

  return { ok: true }
})
