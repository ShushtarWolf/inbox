import { createHash } from 'node:crypto'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:reset-password')
  const { token, password } = await readBody<{ token?: string; password?: string }>(event)
  if (!token || !password || password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
  if (!record) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired token' })
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashSecret(password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true }
})
