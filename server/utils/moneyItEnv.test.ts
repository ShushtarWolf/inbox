import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveMoneyItDatabaseUrl } from './moneyItEnv'

const ciYml = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

describe('money IT CI gate', () => {
  const prevUrl = process.env.MONEY_IT_DATABASE_URL
  const prevCi = process.env.CI

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.MONEY_IT_DATABASE_URL
    else process.env.MONEY_IT_DATABASE_URL = prevUrl
    if (prevCi === undefined) delete process.env.CI
    else process.env.CI = prevCi
  })

  it('rejects URLs that are not the isolated wallet_it schema', () => {
    process.env.MONEY_IT_DATABASE_URL = 'postgresql://u:p@localhost:5432/inbox?schema=public'
    delete process.env.CI
    expect(() => resolveMoneyItDatabaseUrl()).toThrow(/wallet_it/)
  })

  it('fails loud in CI when MONEY_IT_DATABASE_URL is unset (no silent skip)', () => {
    delete process.env.MONEY_IT_DATABASE_URL
    process.env.CI = 'true'
    expect(() => resolveMoneyItDatabaseUrl()).toThrow(/required in CI/)
  })

  it('allows local skip when unset outside CI', () => {
    delete process.env.MONEY_IT_DATABASE_URL
    delete process.env.CI
    expect(resolveMoneyItDatabaseUrl()).toBeUndefined()
  })

  it('wires npm run test:money into CI with wallet_it', () => {
    expect(ciYml).toMatch(/npm run test:money/)
    expect(ciYml).toMatch(/MONEY_IT_DATABASE_URL:[^\n]*schema=wallet_it/)
  })
})
