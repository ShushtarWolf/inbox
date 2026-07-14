const DEMO_EMAIL_SUFFIX = '@inbox.local'

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(DEMO_EMAIL_SUFFIX)
}

export function rejectDemoEmailInProduction(email: string): void {
  if (process.env.NODE_ENV === 'production' && isDemoEmail(email)) {
    throw createError({ statusCode: 403, statusMessage: 'Demo accounts are not available' })
  }
}
