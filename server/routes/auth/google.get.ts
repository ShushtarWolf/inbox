/**
 * Google OAuth is hard-off for COURT-MVP (Iran). Always 404 — do not redirect
 * even if OAuth env vars are present.
 */
export default defineEventHandler(async () => {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' })
})
