/** Behnaz-style pilot: club + athlete (+ admin). Coach UX hidden; data model stays. */
export function isPilotNoCoach(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NUXT_PUBLIC_PILOT_NO_COACH === 'true' || env.PILOT_NO_COACH === 'true'
}
