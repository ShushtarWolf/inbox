import { createAndSendPhoneOtp, type OtpPurpose, type OtpRole } from '../../utils/otp'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:otp-request')
  const body = await readBody<{
    phone?: string
    purpose?: OtpPurpose
    role?: OtpRole
    name?: string
    clubNameFa?: string
    city?: string
  }>(event)

  const purpose = body.purpose === 'login' ? 'login' : 'register'
  const role = body.role === 'COACH' || body.role === 'CLUB_ADMIN' ? body.role : 'ATHLETE'

  if (purpose === 'register') {
    const name = body.name?.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name required' })
    }
    if (role === 'CLUB_ADMIN' && !body.clubNameFa?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Club name required' })
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
  }
})
