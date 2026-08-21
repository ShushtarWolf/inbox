import { createAndSendPhoneOtp } from '../../utils/otp'

/**
 * Password recovery via SMS OTP (product does not use email).
 * Body: { phone } → sends purpose=password_reset OTP through Kavenegar.
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:forgot-password')
  const body = await readBody<{ phone?: string }>(event)

  const result = await createAndSendPhoneOtp({
    phoneRaw: body.phone || '',
    purpose: 'password_reset',
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
