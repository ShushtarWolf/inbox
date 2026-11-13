/**
 * Money integration tests must use an isolated Postgres schema.
 * Never point MONEY_IT_DATABASE_URL at production.
 */
export function resolveMoneyItDatabaseUrl(): string | undefined {
  const url = process.env.MONEY_IT_DATABASE_URL
  if (url && !/schema=wallet_it/.test(url)) {
    throw new Error('MONEY_IT_DATABASE_URL must target the isolated wallet_it schema')
  }
  // CI must not silently skip wallet/settlement ITs (describe.skip when unset).
  if (!url && process.env.CI) {
    throw new Error(
      'MONEY_IT_DATABASE_URL required in CI (postgresql://…/inbox?schema=wallet_it)',
    )
  }
  return url
}
