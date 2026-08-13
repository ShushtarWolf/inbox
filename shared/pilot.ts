/** Coach product can be hidden via PILOT_NO_COACH / NUXT_PUBLIC_PILOT_NO_COACH. */
export function isPilotNoCoach(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NUXT_PUBLIC_PILOT_NO_COACH === 'true' || env.PILOT_NO_COACH === 'true'
}
