/** Production must never wipe+reseed demo catalog (*@inbox.local clubs). */

export function productionDemoSeedMessage(): string {
  return 'Refusing FORCE_SEED_RESET and/or SEED_DEMO_DATA when NODE_ENV=production. Use POST /api/admin/reset-pilot instead.'
}

export function shouldRefuseProductionDemoSeed(env: {
  NODE_ENV?: string
  FORCE_SEED_RESET?: string
  SEED_DEMO_DATA?: string
}): boolean {
  if (env.NODE_ENV !== 'production') return false
  return env.FORCE_SEED_RESET === 'true' || env.SEED_DEMO_DATA === 'true'
}
