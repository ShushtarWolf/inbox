#!/usr/bin/env node
/**
 * Recapture OOM / admin-gate / error screenshots.
 * Admin secret is memory-only (useState) — unlock AFTER navigating to the target path.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { loadDotEnv, login } from '../scripts/lib/smoke-helpers.mjs'
import { createCookieJar, storageStateForSession } from './lib/auth.mjs'
import { pathToPageId } from './lib/routes.mjs'
import { viewportContext } from './lib/viewports.mjs'

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const MANIFEST_PATH = path.join(TOOL, 'results/manifest.json')
loadDotEnv(path.join(ROOT, '.env'))

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SECRET = process.env.ADMIN_PROVISION_SECRET

const adminRoutes = JSON.parse(fs.readFileSync(path.join(TOOL, 'admin-routes.json'), 'utf8'))
const ownerExtra = [
  {
    path: '/owner/calendar-sources',
    source: 'modules/inbox-external-calendar/runtime/pages/owner/calendar-sources.vue',
    auth: 'owner',
  },
]

async function unlockOnCurrentPage(page) {
  const input = page.locator('#admin-secret')
  if (!(await input.isVisible({ timeout: 8_000 }).catch(() => false))) {
    return true // already unlocked / no gate
  }
  await input.fill(SECRET)
  const wait = page
    .waitForResponse((r) => r.url().includes('/api/admin/') && r.ok(), { timeout: 30_000 })
    .catch(() => null)
  await page.locator('form button[type="submit"]').click()
  await wait
  await page.waitForTimeout(1000)
  return !(await input.isVisible().catch(() => false))
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(500)
  // Detect Nuxt OOM / error page
  const body = await page.locator('body').innerText().catch(() => '')
  if (/out of memory|Worker terminated|An error has occurred/i.test(body)) {
    throw new Error(`error page: ${body.slice(0, 120)}`)
  }
}

function pushManifest(manifest, entry) {
  manifest.pages = manifest.pages.filter((p) => !(p.id === entry.id && p.viewport === entry.viewport))
  manifest.pages.push(entry)
}

async function captureAdmin(browser, route, viewportId, manifest) {
  const v = viewportContext(viewportId)
  const ctx = await browser.newContext({ ...v, baseURL: BASE })
  const page = await ctx.newPage()
  const id = pathToPageId(route.path)
  const file = path.join(ROOT, 'design-inventory', viewportId, `${id}.png`)

  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForTimeout(800)
      const unlocked = await unlockOnCurrentPage(page)
      if (!unlocked) throw new Error('admin unlock failed')
      await waitReady(page)
      // Prefer unlocked shell content
      await page.locator('#admin-secret').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
      pushManifest(manifest, {
        id,
        path: route.path,
        kind: 'page',
        source: route.source,
        auth: 'admin',
        viewport: viewportId,
        file: path.relative(ROOT, file),
      })
      console.log('ok', viewportId, route.path)
      await ctx.close()
      return
    } catch (e) {
      lastErr = e
      console.warn(`retry ${attempt}`, route.path, e.message)
      await page.waitForTimeout(2000)
    }
  }
  await ctx.close()
  throw lastErr
}

async function captureOwner(browser, route, viewportId, jar, manifest) {
  const v = viewportContext(viewportId)
  const state = await storageStateForSession(BASE, jar, 'owner')
  const ctx = await browser.newContext({ ...v, baseURL: BASE, storageState: state })
  const page = await ctx.newPage()
  const id = pathToPageId(route.path)
  const file = path.join(ROOT, 'design-inventory', viewportId, `${id}.png`)

  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Client-side soft load: open calendar first (stable), then SPA-click / evaluate navigate
      await page.goto('/owner/calendar', { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await waitReady(page)
      await page.evaluate((p) => {
        // Nuxt 3 app: use history API + click a link if present
        const a = document.createElement('a')
        a.href = p
        a.setAttribute('data-recapture', '1')
        document.body.appendChild(a)
        a.click()
      }, route.path)
      await page.waitForURL((url) => url.pathname.includes('calendar-sources'), { timeout: 20_000 }).catch(async () => {
        await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      })
      await page.waitForTimeout(1200)
      await waitReady(page)
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
      pushManifest(manifest, {
        id,
        path: route.path,
        kind: 'page',
        source: route.source,
        auth: 'owner',
        viewport: viewportId,
        file: path.relative(ROOT, file),
      })
      console.log('ok', viewportId, route.path)
      await ctx.close()
      return
    } catch (e) {
      lastErr = e
      console.warn(`retry ${attempt}`, route.path, e.message)
      await page.waitForTimeout(2000)
    }
  }
  await ctx.close()
  throw lastErr
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const jar = createCookieJar()
await login(BASE, jar, 'owner', 'owner@inbox.local')

const browser = await chromium.launch({ headless: true })
const failures = []

for (const viewportId of ['desktop', 'mobile']) {
  for (const route of adminRoutes) {
    try {
      await captureAdmin(browser, route, viewportId, manifest)
    } catch (e) {
      failures.push({ path: route.path, viewport: viewportId, reason: e.message })
      console.error('FAIL', viewportId, route.path, e.message)
    }
  }
  for (const route of ownerExtra) {
    try {
      await captureOwner(browser, route, viewportId, jar, manifest)
    } catch (e) {
      failures.push({ path: route.path, viewport: viewportId, reason: e.message })
      console.error('FAIL', viewportId, route.path, e.message)
    }
  }
}

await browser.close()
manifest.skipped = (manifest.skipped || []).filter(
  (s) => !failures.some((f) => f.path === s.path && f.viewport === s.viewport),
)
for (const f of failures) {
  manifest.skipped.push({ id: pathToPageId(f.path), path: f.path, viewport: f.viewport, reason: f.reason })
}
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
fs.writeFileSync(path.join(TOOL, 'results/recapture-failures.json'), JSON.stringify(failures, null, 2))
console.log('done failures=', failures.length)
process.exit(failures.length ? 1 : 0)
