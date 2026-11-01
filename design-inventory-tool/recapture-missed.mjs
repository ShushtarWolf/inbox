#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { loadDotEnv } from '../scripts/lib/smoke-helpers.mjs'
import { unlockAdminUi } from './lib/auth.mjs'
import { viewportContext } from './lib/viewports.mjs'

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const MANIFEST_PATH = path.join(TOOL, 'results', 'manifest.json')
loadDotEnv(path.join(ROOT, '.env'))
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SECRET = process.env.ADMIN_PROVISION_SECRET

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
manifest.skipped = manifest.skipped.filter((s) => !s.path.includes('/admin/clubs/[id]'))

function pushPage(entry) {
  manifest.pages = manifest.pages.filter((p) => !(p.id === entry.id && p.viewport === entry.viewport))
  manifest.pages.push(entry)
  manifest.skipped = manifest.skipped.filter((s) => !(s.id === entry.id && s.viewport === entry.viewport))
}

const browser = await chromium.launch({ headless: true })

async function openLoginModal(page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/login', { timeout: 30_000 })
  await page.waitForTimeout(800)
  await page.locator('#login-phone').waitFor({ state: 'visible', timeout: 25_000 })
}

async function shot(viewportId, id, routePath, source, kind, run) {
  const v = viewportContext(viewportId)
  const ctx = await browser.newContext({ ...v, baseURL: BASE })
  const page = await ctx.newPage()
  await run(page)
  const file = path.join(ROOT, 'design-inventory', viewportId, `${id}.png`)
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  pushPage({
    id,
    path: routePath,
    kind,
    source,
    auth: id.includes('admin') ? 'admin' : 'guest',
    viewport: viewportId,
    file: path.relative(ROOT, file),
  })
  await ctx.close()
  console.log('ok', viewportId, id)
}

await shot('desktop', 'page-admin-clubs-cmvi2xpkl000bjstmvuh4inqf', '/admin/clubs/cmvi2xpkl000bjstmvuh4inqf', 'app/pages/admin/clubs/[id].vue', 'page', async (page) => {
  await unlockAdminUi(page, SECRET)
  await page.goto('/admin/clubs/cmvi2xpkl000bjstmvuh4inqf', { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(800)
})

for (const viewportId of ['desktop', 'mobile']) {
  await shot(viewportId, 'modal-auth-gate', '/login → / (AuthFlowModal)', 'app/components/AuthFlowModal.vue', 'modal', openLoginModal)
  await shot(viewportId, 'page-login', '/login', 'app/pages/login.vue', 'page', openLoginModal)
}

for (const viewportId of ['desktop', 'mobile']) {
  await shot(viewportId, 'modal-login-otp', '/login → OTP step', 'app/components/AuthFlowModal.vue', 'modal', async (page) => {
    await openLoginModal(page)
    await page.locator('#login-phone').fill('09121234567')
    await page.locator('button[type="submit"]').click()
    await page.locator('#login-otp').waitFor({ timeout: 30_000 })
  })
}

await browser.close()
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
