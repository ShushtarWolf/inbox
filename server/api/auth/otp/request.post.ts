import { createAndSendPhoneOtp, type OtpPurpose, type OtpRole } from '../../../utils/otp'
import { parseGender } from '#shared/gender.ts'

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:otp-request')
  const body = await readBody<{
    phone?: string
    purpose?: OtpPurpose
    role?: OtpRole
    name?: string
    gender?: string
    clubNameFa?: string
    city?: string
    addressFa?: string
    sport?: string
    courtCount?: number | string
    credentialUrls?: string[]
    returnTo?: string
  }>(event)

  const purpose = body.purpose === 'login' ? 'login' : 'register'
  const role = body.role === 'COACH' || body.role === 'CLUB_ADMIN' ? body.role : 'ATHLETE'

  if (purpose === 'register' && role === 'COACH') {
    assertCoachProductEnabled(event)
  }

  let gender: 'MALE' | 'FEMALE' | undefined
  if (purpose === 'register') {
    const name = body.name?.trim()
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name required' })
    }
    const parsedGender = parseGender(body.gender)
    if (!parsedGender) {
      throw createError({ statusCode: 400, statusMessage: 'Gender required' })
    }
    gender = parsedGender
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
          gender,
          clubNameFa: body.clubNameFa?.trim(),
          city: body.city?.trim() || 'تهران',
          addressFa: body.addressFa?.trim(),
          sport: body.sport,
          courtCount: body.courtCount,
          credentialUrls: Array.isArray(body.credentialUrls) ? body.credentialUrls.filter(Boolean) : undefined,
        }
      : undefined,
  })

  return {
    ok: true,
    phone: result.phone,
    expiresIn: result.expiresIn,
    debugCode: result.debugCode,
    smsMode: result.smsMode,
    smsPhase: result.smsPhase,
  }
})
