#!/usr/bin/env node
/**
 * Screenshot HTML vs live admin overview + main list pages.
 * Also refreshes final home + owner-calendar pairs for the GAPS done gate.
 * Usage: ADMIN_PROVISION_SECRET=… node scripts/check-html-admin-slice.mjs [--base http://[::1]:3000]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_PATH = path.join(ROOT, 'design-reference/inbox-all-pages-html/prototype.html')
const OUT_ROOT = path.join(ROOT, 'design-reference/comparisons')

function loadEnvSecret() {
  if (process.env.ADMIN_PROVISION_SECRET) return process.env.ADMIN_PROVISION_SECRET
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/^ADMIN_PROVISION_SECRET=(.+)$/m)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  }
  return ''
}

const ADMIN_SECRET = loadEnvSecret()

const VIEWPORTS = {
  phone: { width: 375, height: 812, label: '375' },
  desk: { width: 1280, height: 900, label: 'desktop' },
}

const ADMIN_SCREENS = [
  { go: 'admin', route: '/admin', dir: 'admin', wait: '.admin-overview-hero, .admin-a3, .rred' },
  { go: 'admin-clubs', route: '/admin/clubs', dir: 'admin-clubs', wait: 'h1, table, .tail-page-title' },
  { go: 'admin-users', route: '/admin/users', dir: 'admin-users', wait: 'h1, table, .tail-page-title' },
  { go: 'admin-tickets', route: '/admin/tickets', dir: 'admin-tickets', wait: 'h1, .tail-page-title' },
  { go: 'admin-withdrawals', route: '/admin/withdrawals', dir: 'admin-withdrawals', wait: 'h1, .tail-page-title' },
  { go: 'admin-applications', route: '/admin/applications', dir: 'admin-applications', wait: 'h1, .tail-page-title' },
]

function parseArgs(argv) {
  const out = { base: process.env.BASE_URL || 'http://[::1]:3000' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
  }
  return out
}

function chromePath() {
  return path.join(
    process.env.HOME || '',
    'Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  )
}

async function prepHtml(page) {
  await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => typeof window.go === 'function' && document.getElementById('pages'), null, {
    timeout: 30_000,
  })
  await page.addStyleTag({
    content: '.proto{display:none!important}#pages{padding-top:0!important}',
  })
}

/** Secret is memory-only: unlock once after hydration, then navigate in-app (never page.goto). */
async function unlockAdmin(page, base) {
  if (!ADMIN_SECRET) throw new Error('ADMIN_PROVISION_SECRET missing')
  await page.goto(new URL('/admin', base).href, { waitUntil: 'networkidle', timeout: 120_000 })
  const gate = page.locator('#admin-secret')
  await gate.waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(1500)
  await gate.click()
  await gate.pressSequentially(ADMIN_SECRET, { delay: 10 })
  await page.locator('button[type="submit"]').click()
  await page.waitForSelector('.admin-overview-hero, .admin-a3', { timeout: 40_000 })
  await page.waitForTimeout(800)
}

async function goAdminRoute(page, route) {
  if (route === '/admin') return
  // Side nav can sit outside the viewport; DOM click keeps SPA nav (secret stays in memory).
  const link = page.locator(`a[href$="${route}"], a[href*="${route}?"]`).first()
  await link.evaluate((el) => el.click())
  await page.waitForURL((u) => u.pathname.endsWith(route), { timeout: 30_000 })
}

async function shot(page, filePath, clipEl) {
  try {
    if (clipEl) {
      const visible = await clipEl.isVisible().catch(() => false)
      if (visible) {
        await clipEl.screenshot({ path: filePath, timeout: 15_000 })
        console.log(`wrote ${path.relative(ROOT, filePath)}`)
        return
      }
    }
  } catch {
    /* fall through */
  }
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`wrote ${path.relative(ROOT, filePath)} (page)`)
}

async function captureHtmlAdmin(browser) {
  for (const screen of ADMIN_SCREENS) {
    const dir = path.join(OUT_ROOT, screen.dir)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await prepHtml(page)
      await page.evaluate((id) => {
        window.go(id)
        window.scrollTo(0, 0)
      }, screen.go)
      await page.waitForTimeout(500)
      const el = await page.$(`#pg-${screen.go} .dash, #pg-${screen.go}`)
      await shot(page, path.join(dir, `html-${screen.dir}-${vp.label}.png`), el)
      await context.close()
    }
  }
}

async function captureLiveAdmin(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  for (const screen of ADMIN_SCREENS) {
    const dir = path.join(OUT_ROOT, screen.dir)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: 'fa-IR',
      })
      const page = await context.newPage()
      try {
        await unlockAdmin(page, base)
        await goAdminRoute(page, screen.route)
        await page.waitForSelector(screen.wait, { timeout: 25_000 }).catch(() => {})
        await page.waitForTimeout(1000)
        await page.screenshot({ path: path.join(dir, `live-${screen.dir}-${vp.label}.png`), fullPage: false })
        console.log(`wrote live-${screen.dir}-${vp.label}.png`)
      } catch (e) {
        console.error('admin live fail', screen.go, e.message)
      }
      await context.close()
    }
  }
}

async function captureFinalPairs(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  // Home
  const homeDir = path.join(OUT_ROOT, 'home')
  fs.mkdirSync(homeDir, { recursive: true })
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'fa-IR',
    })
    const page = await context.newPage()
    await prepHtml(page)
    await page.evaluate(() => { window.go('home'); window.scrollTo(0, 0) })
    await page.waitForTimeout(500)
    const el = await page.$('#pg-home .dash, #pg-home, .page.active')
    await shot(page, path.join(homeDir, `html-home-${vp.label}.png`), el)
    await page.goto(new URL('/', base).href, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(homeDir, `live-home-${vp.label}.png`), fullPage: false })
    console.log(`wrote live-home-${vp.label}.png`)
    await context.close()
  }

  // Owner calendar
  const calDir = path.join(OUT_ROOT, 'owner-calendar')
  fs.mkdirSync(calDir, { recursive: true })
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'fa-IR',
    })
    const page = await context.newPage()
    await prepHtml(page)
    if (vp.label === '375') {
      await page.evaluate(() => { window.go('m-owner'); window.scrollTo(0, 0) })
      await page.waitForTimeout(700)
      const phone = await page.$('#m5')
      await shot(page, path.join(calDir, 'html-owner-calendar-m-375.png'), phone)
    } else {
      await page.evaluate(() => {
        window.go('owner-calendar')
        if (typeof window.ocRender === 'function') window.ocRender()
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(600)
      const el = await page.$('#pg-owner-calendar .dash, #pg-owner-calendar')
      await shot(page, path.join(calDir, 'html-owner-calendar-desktop.png'), el)
    }
    const login = await page.request.post(new URL('/api/auth/login', base).href, {
      data: { email: 'owner@inbox.local', password: 'demo1234' },
    })
    if (!login.ok()) {
      console.error('owner login', login.status())
      await context.close()
      continue
    }
    await page.goto(new URL('/owner/calendar', base).href, { waitUntil: 'load', timeout: 120_000 })
    // Empty-state renders before the slow dev fetch; wait for real cells (seeded blocked + booked).
    await page.waitForSelector('.canva-cal-grid-cell.slot-blocked, .canva-cal-grid-cell', { timeout: 120_000 }).catch(() => {})
    await page.locator('.canva-cal-grid-cell.slot-blocked').first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(calDir, `live-owner-calendar-${vp.label}.png`), fullPage: false })
    console.log(`wrote live-owner-calendar-${vp.label}.png`)
    const grid = page.locator('.canva-cal-grid, .canva-cal-grid-shell').first()
    if (await grid.count()) {
      await grid.screenshot({ path: path.join(calDir, `live-owner-calendar-grid-${vp.label}.png`), timeout: 10_000 }).catch(() => {})
      console.log(`wrote live-owner-calendar-grid-${vp.label}.png`)
    }
    await context.close()
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const only = process.argv.includes('--admin-live-only')
  const finalOnly = process.argv.includes('--final-only')
  console.log('base', opts.base, 'secret', ADMIN_SECRET ? 'set' : 'MISSING')
  const launchOpts = { headless: true }
  const chrome = chromePath()
  if (fs.existsSync(chrome)) launchOpts.executablePath = chrome
  const browser = await chromium.launch(launchOpts)
  try {
    if (!only && !finalOnly) await captureHtmlAdmin(browser)
    if (!finalOnly) await captureLiveAdmin(browser, opts)
    if (!only) await captureFinalPairs(browser, opts)
  } finally {
    await browser.close()
  }
  console.log('done →', path.relative(ROOT, OUT_ROOT))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
