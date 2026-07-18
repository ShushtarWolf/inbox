import { randomInt } from 'node:crypto'
import { hashSecret, verifySecret } from './password'
import { normalizeIranPhone } from '#shared/phone.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import { sendSms } from './sms/service'
import { renderOtpSms } from './sms/templates'

export type OtpPurpose = 'login' | 'register'
export type OtpRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999))
}

export async function createAndSendPhoneOtp(opts: {
  phoneRaw: string
  purpose: OtpPurpose
  role?: OtpRole
  payload?: Record<string, unknown>
}) {
  const phone = normalizeIranPhone(opts.phoneRaw)
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }

  const existingUser = await prisma.user.findUnique({ where: { phone } })
  if (opts.purpose === 'login' && !existingUser) {
    throw createError({ statusCode: 404, statusMessage: 'Phone not registered' })
  }
  if (opts.purpose === 'register' && existingUser) {
    throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
  }

  await prisma.phoneOtp.updateMany({
    where: { phone, purpose: opts.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  const code = generateOtpCode()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: hashSecret(code),
      purpose: opts.purpose,
      role: opts.role || null,
      payloadJson: opts.payload ? JSON.stringify(opts.payload) : null,
      expiresAt,
    },
  })

  const body = renderOtpSms(code)
  let debugFallback = false
  try {
    await sendSms({ to: phone, body })
  } catch (err) {
    // Pilot/local: keep OTP usable if live SMS is misconfigured. Never expose debugCode in production.
    if (process.env.NODE_ENV === 'production') {
      console.error('[otp] SMS send failed', err instanceof Error ? err.message : 'unknown')
      throw createError({
        statusCode: 502,
        statusMessage: 'SMS delivery failed',
      })
    }
    console.warn('[otp] SMS send failed — enabling debugCode for local recovery', err)
    debugFallback = true
  }

  return {
    phone,
    expiresIn: Math.floor(OTP_TTL_MS / 1000),
    /** Returned only while SMS is log/dry-run, or after a non-prod live SMS failure. Never when live send succeeds. */
    debugCode: resolveSmsProvider() === 'log' || debugFallback ? code : undefined,
  }
}

export async function consumePhoneOtp(opts: {
  phoneRaw: string
  code: string
  purpose: OtpPurpose
}) {
  const phone = normalizeIranPhone(opts.phoneRaw)
  const code = opts.code?.trim()
  if (!phone || !code) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const record = await prisma.phoneOtp.findFirst({
    where: {
      phone,
      purpose: opts.purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    throw createError({ statusCode: 400, statusMessage: 'OTP expired or missing' })
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  }

  const ok = verifySecret(code, record.codeHash)
  if (!ok) {
    await prisma.phoneOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    throw createError({ statusCode: 400, statusMessage: 'Invalid OTP' })
  }

  await prisma.phoneOtp.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  return {
    phone,
    role: (record.role as OtpRole | null) || null,
    payload: record.payloadJson ? JSON.parse(record.payloadJson) as Record<string, unknown> : {},
  }
}
