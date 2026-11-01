#!/usr/bin/env node
/** Re-capture admin routes after unlock fix; merges into manifest.json */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { loadDotEnv } from '../scripts/lib/smoke-helpers.mjs'
import { unlockAdminUi } from './lib/auth.mjs'
import { pathToPageId } from './lib/routes.mjs'
import { viewportContext } from './lib/viewports.mjs'

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const MANIFEST_PATH = path.join(TOOL, 'results', 'manifest.json')
loadDotEnv(path.join(ROOT, '.env'))

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN_SECRET = process.env.ADMIN_PROVISION_SECRET

const adminRoutes = JSON.parse(fs.readFileSync(path.join(TOOL, 'admin-routes.json'), 'utf8'))

async function captureOne(browser, route, viewportId, manifest) {
  const v = viewportContext(viewportId)
  const context = await browser.newContext({ ...v, baseURL: BASE })
  const page = await context.newPage()
  const ok = await unlockAdminUi(page, ADMIN_SECRET)
  if (!ok) throw new Error('admin unlock failed')
  const id = pathToPageId(route.path)
  const file = path.join(ROOT, 'design-inventory', viewportId, `${id}.png`)
  await page.goto(route.path, { waitUntil: 'networkidle', timeout: 90_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  manifest.pages = manifest.pages.filter((p) => !(p.id === id && p.viewport === viewportId))
  manifest.pages.push({
    id,
    path: route.path,
    kind: 'page',
    source: route.source,
    auth: 'admin',
    viewport: viewportId,
    file: path.relative(ROOT, file),
  })
  manifest.skipped = manifest.skipped.filter(
    (s) => !(s.path === route.path && s.viewport === viewportId),
  )
  await context.close()
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const browser = await chromium.launch({ headless: true })
for (const viewportId of ['desktop', 'mobile']) {
  for (const route of adminRoutes) {
    try {
      await captureOne(browser, route, viewportId, manifest)
      console.log('ok', viewportId, route.path)
    } catch (e) {
      console.warn('skip', route.path, e.message)
    }
  }
}
await browser.close()
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
