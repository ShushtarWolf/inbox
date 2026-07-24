import { normalizeIranPhone } from '#shared/phone.ts'
import { createAndSendPhoneOtp, type OtpPurpose, type OtpRole } from '../../../utils/otp'
import { isOtpBypassPhone } from '../../../utils/otpBypass'
import { findUserForPhoneOtp } from '../../../utils/phoneAuth'
import { postLoginRedirectPath, toSessionUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:otp-request')
  const body = await readBody<{
    phone?: string
    purpose?: OtpPurpose
    role?: OtpRole
    name?: string
    clubNameFa?: string
    city?: string
    returnTo?: string
  }>(event)

  const purpose = body.purpose === 'login' ? 'login' : 'register'
  const role = body.role === 'COACH' || body.role === 'CLUB_ADMIN' ? body.role : 'ATHLETE'
  const phone = normalizeIranPhone(body.phone || '')

  if (purpose === 'register' && role === 'COACH') {
    assertCoachProductEnabled(event)
  }

  if (purpose === 'register') {
    const name = body.name?.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name required' })
    }
    if (role === 'CLUB_ADMIN' && !body.clubNameFa?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Club name required' })
    }
  }

  // Allowlisted owner phones skip SMS OTP and receive a session immediately on login.
  if (purpose === 'login' && phone && isOtpBypassPhone(phone)) {
    const match = await findUserForPhoneOtp(phone)
    if (!match) {
      throw createError({ statusCode: 404, statusMessage: 'Phone not registered' })
    }
    const { user, linkPhone } = match
    if (user.disabledAt) {
      throw createError({ statusCode: 403, statusMessage: 'Account disabled' })
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(linkPhone ? { phone } : {}),
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    })
    await setUserSession(event, { user: toSessionUser(user) })
    return {
      ok: true,
      phone,
      bypass: true,
      smsMode: 'bypass' as const,
      redirectTo: postLoginRedirectPath(user, user.locale, body.returnTo),
    }
  }

  const result = await createAndSendPhoneOtp({
    phoneRaw: body.phone || '',
    purpose,
    role: purpose === 'register' ? role : undefined,
    payload: purpose === 'register'
      ? {
          name: body.name?.trim(),
          clubNameFa: body.clubNameFa?.trim(),
          city: body.city?.trim() || 'تهران',
        }
      : undefined,
  })

  return {
    ok: true,
    phone: result.phone,
    expiresIn: result.expiresIn,
    debugCode: result.debugCode,
    smsMode: result.smsMode,
  }
})
