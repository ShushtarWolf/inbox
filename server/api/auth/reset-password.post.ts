import { createHash } from 'node:crypto'
import { normalizeIranPhone } from '#shared/phone.ts'
import { consumePhoneOtp } from '../../utils/otp'
import { findUserForPhoneOtp, linkOrphanBookingsByPhone } from '../../utils/phoneAuth'
import { hashSecret } from '../../utils/password'
import { enforceOtpVerifyPhoneLimit } from '../../utils/rateLimit'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Set a new password after SMS OTP (primary) or legacy email reset token.
 * SMS: { phone, code, password }
 * Legacy email link: { token, password }
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:reset-password')
  const body = await readBody<{
    phone?: string
    code?: string
    token?: string
    password?: string
  }>(event)

  const password = body.password
  if (!password || password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  // Primary path: phone + SMS OTP
  if (body.phone && body.code) {
    const phone = normalizeIranPhone(body.phone)
    if (!phone) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
    }
    await enforceOtpVerifyPhoneLimit(phone)
    const consumed = await consumePhoneOtp({
      phoneRaw: phone,
      code: body.code,
      purpose: 'password_reset',
    })
    const match = await findUserForPhoneOtp(consumed.phone)
    if (!match) {
      throw createError({ statusCode: 404, statusMessage: 'Phone not registered' })
    }

    await prisma.user.update({
      where: { id: match.user.id },
      data: {
        passwordHash: hashSecret(password),
        ...(match.linkPhone ? { phone: match.phone, phoneVerifiedAt: new Date() } : {}),
      },
    })
    if (match.linkPhone || match.user.phone === match.phone) {
      await linkOrphanBookingsByPhone(match.user.id, match.phone)
    }

    return { ok: true, via: 'sms' as const }
  }

  // Legacy email-token path (kept for old links)
  const token = body.token?.trim()
  if (!token) {
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

  return { ok: true, via: 'token' as const }
})
