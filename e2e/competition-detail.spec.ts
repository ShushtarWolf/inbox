import { test, expect } from '@playwright/test'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'

function isoOffset(days: number, hours = 14) {
  const d = new Date(Date.now() + days * 86400000)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

async function loginOwner() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@inbox.local', password: 'demo1234' }),
  })
  if (!res.ok) throw new Error(`owner login → ${res.status}`)
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

async function createOpenCompetition(cookie: string) {
  const today = new Date().toISOString().slice(0, 10)
  const calRes = await fetch(`${base}/api/owner/calendar?date=${today}`, {
    headers: { cookie },
  })
  if (!calRes.ok) throw new Error(`owner calendar → ${calRes.status}`)
  const cal = await calRes.json()
  const sportId = cal?.courts?.[0]?.sportId
  if (!sportId) throw new Error('demo club missing court/sport')

  const createRes = await fetch(`${base}/api/owner/competitions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      sportId,
      title: `E2E Pilot ${Date.now()}`,
      format: 'knockout',
      enrollmentType: 'SINGLE',
      entryFee: 200000,
      prizeType: 'WALLET',
      prizeConfigJson: { placements: [{ placement: 1, amount: 500000 }] },
      maxParticipants: 16,
      minParticipants: 2,
      registrationOpens: isoOffset(-1),
      registrationCloses: isoOffset(20),
      eventAt: isoOffset(30),
      publish: true,
    }),
  })
  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`create competition → ${createRes.status}: ${err}`)
  }
  const { competition } = await createRes.json()
  return competition.id as string
}

test.describe('competition detail @375px', () => {
  test.use({ serviceWorkers: 'block' })

  test.skip(
    process.env.COMPETITIONS_ENABLED !== 'true'
      && process.env.NUXT_PUBLIC_COMPETITIONS_ENABLED !== 'true',
    'requires COMPETITIONS_ENABLED=true on server (set in CI env)',
  )

  let competitionId: string

  test.beforeAll(async () => {
    const cookie = await loginOwner()
    competitionId = await createOpenCompetition(cookie)
  })

  test('fee, prize, cancel policy visible before join CTA', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 375, height: 812 })

    const path = `/competitions/${competitionId}`
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // PWA cache-bust may reload once on first visit — retry if labels missing
    const feeLabel = page.getByText('هزینه ثبت‌نام', { exact: true })
    if (!(await feeLabel.isVisible().catch(() => false))) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    }

    const prizeLabel = page.getByText('جوایز', { exact: true })
    const cancelLabel = page.getByText('سیاست لغو', { exact: true })
    const joinCta = page.getByRole('button', { name: /ثبت‌نام/ })

    await expect(feeLabel).toBeVisible({ timeout: 30_000 })
    await expect(prizeLabel).toBeVisible({ timeout: 15_000 })
    await expect(cancelLabel).toBeVisible({ timeout: 15_000 })
    await expect(joinCta).toBeVisible({ timeout: 15_000 })

    const feeBox = await feeLabel.boundingBox()
    const joinBox = await joinCta.boundingBox()
    expect(feeBox).not.toBeNull()
    expect(joinBox).not.toBeNull()
    expect(feeBox!.y).toBeLessThan(joinBox!.y)
  })
})
