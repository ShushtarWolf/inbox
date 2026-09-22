/**
 * Athlete password registration — retired. Athletes sign in with phone OTP only.
 * Club owners / coaches use register-owner / register-coach (password) or OTP.
 */
export default defineEventHandler(async () => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Athlete password registration retired; use phone OTP',
  })
})
