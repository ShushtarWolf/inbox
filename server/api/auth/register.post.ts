/**
 * Email/password athlete registration is retired for the Iran MVP.
 * Use phone OTP: POST /api/auth/otp/request + /api/auth/otp/verify.
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'auth:register')
  throw createError({
    statusCode: 410,
    statusMessage: 'Email registration disabled — use phone OTP',
  })
})
