import { createCookieJar, login, loginViaOtp } from '../../scripts/lib/smoke-helpers.mjs'

export { createCookieJar }

export async function storageStateForSession(base, jar, session) {
  const cookieHeader = jar.get(session)
  if (!cookieHeader) return undefined
  const pairs = cookieHeader.split('; ').map((part) => {
    const eq = part.indexOf('=')
    return { name: part.slice(0, eq), value: part.slice(eq + 1), url: base }
  })
  return { cookies: pairs, origins: [] }
}

export async function ensureSessions(base) {
  const jar = createCookieJar()
  await loginViaOtp(base, jar, 'athlete', '09121234567')
  await login(base, jar, 'owner', 'owner@inbox.local')
  await login(base, jar, 'coach', 'coach@inbox.local')
  return jar
}

export async function loginAthleteUi(page) {
  await page.goto('/login')
  await page.locator('#login-phone').waitFor({ timeout: 20_000 })
  await page.locator('#login-phone').fill('09121234567')
  await page.locator('button[type="submit"]').click()
  await page.locator('#login-otp').waitFor({ timeout: 20_000 })
  await page.locator('button[type="submit"]').click()
  const welcome = page.getByRole('button', { name: 'متوجه شدم' })
  if (await welcome.isVisible({ timeout: 5000 }).catch(() => false)) {
    await welcome.click()
  }
  await page.waitForURL(/\/athlete/, { timeout: 20_000 })
}

export async function loginOwnerUi(page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  if (!res.ok()) throw new Error(`owner login failed: ${res.status()}`)
  await page.goto('/owner/calendar')
  await page.waitForURL(/\/owner/, { timeout: 20_000 })
}

export async function loginCoachUi(page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: 'coach@inbox.local', password: 'demo1234' },
  })
  if (!res.ok()) throw new Error(`coach login failed: ${res.status()}`)
  await page.goto('/coach')
  await page.waitForURL(/\/coach/, { timeout: 20_000 })
}

export async function unlockAdminUi(page, secret) {
  await page.goto('/admin', { waitUntil: 'networkidle', timeout: 90_000 })
  await page.waitForTimeout(1200)
  const input = page.locator('#admin-secret')
  if (!(await input.isVisible({ timeout: 15_000 }).catch(() => false))) {
    return !(await input.isVisible().catch(() => false))
  }
  await input.fill(secret)
  const overviewDone = page
    .waitForResponse((r) => r.url().includes('/api/admin/overview') && r.ok(), { timeout: 25_000 })
    .catch(() => null)
  await page.locator('form button[type="submit"]').click()
  await overviewDone
  await page.waitForTimeout(600)
  return !(await input.isVisible().catch(() => false))
}
