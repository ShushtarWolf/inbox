import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { extractDesignTokens } from './extract-tokens.mjs'
import { loginAthleteUi, loginCoachUi, loginOwnerUi, unlockAdminUi, ensureSessions, storageStateForSession } from './lib/auth.mjs'
import { writeHarnessHtml, harnessShots } from './lib/components-catalog.mjs'
import {
  staticPageRoutes,
  resolveDynamicRoutes,
  uiScenarios,
  pathToPageId,
  routeToFilename,
} from './lib/routes.mjs'
import { VIEWPORTS, viewportContext } from './lib/viewports.mjs'
import { loadDotEnv } from '../scripts/lib/smoke-helpers.mjs'

loadDotEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env'))

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TOOL, '..')
const OUT_DESKTOP = path.join(ROOT, 'design-inventory', 'desktop')
const OUT_MOBILE = path.join(ROOT, 'design-inventory', 'mobile')
const MANIFEST_PATH = path.join(TOOL, 'results', 'manifest.json')

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN_SECRET =
  process.env.ADMIN_PROVISION_SECRET || 'local-design-inventory-dev-secret-32chars'

function outDir(viewportId) {
  return viewportId === 'desktop' ? OUT_DESKTOP : OUT_MOBILE
}

async function waitStable(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {})
  await page.waitForTimeout(350)
}

async function screenshotFull(page, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await page.screenshot({ path: filePath, fullPage: true, animations: 'disabled' })
}

async function screenshotElement(page, selector, filePath) {
  const el = page.locator(selector).first()
  if (!(await el.count())) return false
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await el.screenshot({ path: filePath, animations: 'disabled' })
  return true
}

function authForRoute(route) {
  if (route.auth) return route.auth
  if (route.path.startsWith('/owner')) return 'owner'
  if (route.path.startsWith('/coach')) return 'coach'
  if (route.path.startsWith('/athlete')) return 'athlete'
  if (route.path.startsWith('/admin')) return 'admin'
  return 'guest'
}

async function createContexts(browser, jar) {
  const guest = await browser.newContext({ ...viewportContext('desktop'), baseURL: BASE })
  const contexts = { guest }

  for (const [key, session] of [
    ['athlete', 'athlete'],
    ['owner', 'owner'],
    ['coach', 'coach'],
  ]) {
    const state = await storageStateForSession(BASE, jar, session)
    contexts[key] = await browser.newContext({ ...viewportContext('desktop'), storageState: state, baseURL: BASE })
  }

  contexts.admin = await browser.newContext({ ...viewportContext('desktop'), baseURL: BASE })
  contexts.adminUnlocked = false
  const adminPage = await contexts.admin.newPage()
  contexts.adminUnlocked = await unlockAdminUi(adminPage, ADMIN_SECRET)
  if (!contexts.adminUnlocked) {
    console.warn('admin unlock failed — admin routes may show secret gate only')
  }
  await adminPage.close()

  return contexts
}

function pickContext(contexts, auth) {
  return contexts[auth] || contexts.guest
}

async function applyViewport(context, viewportId) {
  const v = viewportContext(viewportId)
  await context.setViewportSize(v.viewport)
  if (v.userAgent) await context.setExtraHTTPHeaders({})
  // Playwright requires new context for deviceScaleFactor — we recreate per viewport pass
}

async function fetchStylesheetHrefs(browser) {
  const ctx = await browser.newContext({ baseURL: BASE })
  const page = await ctx.newPage()
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitStable(page)
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter(Boolean),
  )
  await ctx.close()
  return hrefs
}

function startHarnessServer(harnessDir) {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] || '/'
    const file = url === '/' ? '/components.html' : url
    const fp = path.join(harnessDir, file.replace(/^\//, ''))
    if (!fp.startsWith(harnessDir) || !fs.existsSync(fp)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const ext = path.extname(fp)
    const type = ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    res.end(fs.readFileSync(fp))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

async function captureHarness(browser, stylesheetHrefs, viewportId, manifest) {
  const { path: harnessPath, shots } = writeHarnessHtml(stylesheetHrefs)
  const { server, url } = await startHarnessServer(path.dirname(harnessPath))
  const v = viewportContext(viewportId)
  const context = await browser.newContext({ ...v, baseURL: BASE })
  const page = await context.newPage()

  await page.goto(`${url}/components.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await waitStable(page)

  for (const shot of shots) {
    const selector = `[data-shot-id="${shot.id}"]`
    const file = path.join(outDir(viewportId), `${shot.id}.png`)
    const loc = page.locator(selector)
    if (!(await loc.count())) {
      manifest.skipped.push({ id: shot.id, reason: 'harness element missing', viewport: viewportId })
      continue
    }
    const el = loc.first()
    if (shot.state === 'hover' && shot.tag === 'button') {
      await el.locator('button').hover().catch(() => {})
    } else if (shot.state === 'focus') {
      await el.locator('button, input').first().focus().catch(() => {})
    } else if (shot.state === 'active' && shot.tag === 'button') {
      await el.locator('button').dispatchEvent('mousedown').catch(() => {})
    }
    await el.screenshot({ path: file, animations: 'disabled' })
    manifest.components.push({
      id: shot.id,
      name: shot.label,
      group: shot.group,
      source: shot.source,
      viewport: viewportId,
      file: path.relative(ROOT, file),
    })
  }

  await context.close()
  server.close()
}

async function capturePages(browser, routes, contexts, viewportId, manifest) {
  const v = viewportContext(viewportId)

  for (const route of routes) {
    const auth = authForRoute(route)
    if (route.mobileOnly && viewportId === 'desktop') continue
    if (auth === 'admin' && !contexts.adminUnlocked) {
      manifest.skipped.push({
        id: route.id || pathToPageId(route.path),
        path: route.path,
        viewport: viewportId,
        reason: 'admin secret gate could not be unlocked',
      })
      continue
    }

    const baseContext = pickContext(contexts, auth)
    const context = await browser.newContext({
      ...v,
      storageState: await baseContext.storageState(),
      baseURL: BASE,
    })
    const page = await context.newPage()

    const id = route.id || pathToPageId(route.path)
    const filename = route.id ? routeToFilename(route.kind || 'page', route.id) : `${pathToPageId(route.path)}.png`
    const file = path.join(outDir(viewportId), filename)

    try {
      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await waitStable(page)
      if (route.prepare) await route.prepare(page)
      await waitStable(page)
      await screenshotFull(page, file)
      manifest.pages.push({
        id,
        path: route.path,
        kind: route.kind || 'page',
        source: route.source,
        auth,
        viewport: viewportId,
        file: path.relative(ROOT, file),
      })
    } catch (err) {
      manifest.skipped.push({
        id,
        path: route.path,
        viewport: viewportId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }

    await context.close()
  }
}

export async function runCapture() {
  fs.mkdirSync(OUT_DESKTOP, { recursive: true })
  fs.mkdirSync(OUT_MOBILE, { recursive: true })
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })

  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE,
    viewports: VIEWPORTS,
    tokens: extractDesignTokens(),
    pages: [],
    components: [],
    vueComponents: harnessShots().vueComponents,
    skipped: [],
  }

  const jar = await ensureSessions(BASE)
  const browser = await chromium.launch({ headless: true })

  const stylesheetHrefs = await fetchStylesheetHrefs(browser)

  const staticRoutes = staticPageRoutes()
  const dynamicRoutes = await resolveDynamicRoutes(BASE)
  const scenarios = uiScenarios()
  const allRoutes = [
    ...staticRoutes.map((r) => ({ ...r, kind: r.kind || 'page' })),
    ...dynamicRoutes,
    ...scenarios,
  ]

  const contexts = await createContexts(browser, jar)

  for (const viewportId of ['desktop', 'mobile']) {
    await capturePages(browser, allRoutes, contexts, viewportId, manifest)
    await captureHarness(browser, stylesheetHrefs, viewportId, manifest)
  }

  await browser.close()

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  return manifest
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCapture()
    .then((m) => {
      console.log(`Capture done: ${m.pages.length} page shots, ${m.components.length} component shots, ${m.skipped.length} skipped`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
