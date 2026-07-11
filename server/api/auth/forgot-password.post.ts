import { createHash, randomBytes } from 'node:crypto'
import { siteUrl } from '../../utils/email'
import { sendNotification } from '../../utils/notify'

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
      const resetUrl = `${siteUrl()}/reset-password?token=${token}`
      await sendNotification({
        channel: 'email',
        to: normalized,
        template: 'PASSWORD_RESET',
        data: { resetUrl },
      })
    }
  }

  return { ok: true }
})
