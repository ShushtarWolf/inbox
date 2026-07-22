/** Public probe: Google sign-in is hidden for Iran MVP (phone OTP). Never returns secrets. */
export default defineEventHandler(() => {
  return { enabled: false }
})
