#!/usr/bin/env node
/**
 * Screenshot HTML vs live athlete: home, bookings, hub/profile, wallet + m-shell.
 * Usage: node scripts/check-html-athlete-slice.mjs [--base http://[::1]:3000]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_PATH = path.join(ROOT, 'design-reference/inbox-all-pages-html/prototype.html')
const OUT = path.join(ROOT, 'design-reference/comparisons')

const VIEWPORTS = {
  phone: { width: 375, height: 812, label: '375' },
  desk: { width: 1280, height: 900, label: 'desktop' },
}

function parseArgs(argv) {
  const out = { base: process.env.BASE_URL || 'http://[::1]:3000' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
  }
  return out
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

async function prepHtml(page) {
  await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => typeof window.go === 'function' && document.getElementById('pages'), null, {
    timeout: 30_000,
  })
  await page.addStyleTag({
    content: '.proto{display:none!important}#pages{padding-top:0!important}',
  })
}

/** Local screenshot login — phone must exist (admin test-athlete). Override via ATHLETE_SHOT_PHONE. */
const ATHLETE_PHONE = process.env.ATHLETE_SHOT_PHONE || '09127654321'

async function loginAthlete(page, base) {
  const otpReq = await page.request.post(new URL('/api/auth/otp/request', base).href, {
    data: { phone: ATHLETE_PHONE, purpose: 'login' },
  })
  if (!otpReq.ok()) throw new Error(`otp request ${otpReq.status()}`)
  const body = await otpReq.json()
  const { debugCode } = body
  if (!debugCode) throw new Error(`no debugCode (smsMode=${body.smsMode}; is phone registered?)`)
  const verify = await page.request.post(new URL('/api/auth/otp/verify', base).href, {
    data: { phone: ATHLETE_PHONE, code: debugCode, purpose: 'login' },
  })
  if (!verify.ok()) throw new Error(`otp verify ${verify.status()}`)
}

async function captureHtml(browser) {
  // Desk dash screens
  const deskScreens = [
    { id: 'athlete-home', go: 'athlete-home' },
    { id: 'athlete-bookings', go: 'athlete-bookings' },
    { id: 'athlete-hub', go: 'athlete-hub' },
    { id: 'athlete-wallet', go: 'athlete-wallet' },
  ]
  for (const screen of deskScreens) {
    const dir = path.join(OUT, screen.id)
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
      await page.waitForTimeout(600)
      const el = await page.$(`#pg-${screen.go} .dash, #pg-${screen.go}`)
      await shot(page, path.join(dir, `html-${screen.id}-${vp.label}.png`), el)
      await context.close()
    }
  }

  // Mobile shell #m1 (home / bookings / profile tabs) + chrome close-ups
  const mTabs = [
    { id: 'm-athlete', tab: null, file: 'html-m-athlete-375.png' },
    { id: 'm-athlete-bookings', tab: 'bookings', file: 'html-m-athlete-bookings-375.png' },
    { id: 'm-athlete-profile', tab: 'profile', file: 'html-m-athlete-profile-375.png' },
  ]
  for (const screen of mTabs) {
    const dir = path.join(OUT, screen.id === 'm-athlete' ? 'm-athlete' : screen.id.replace('m-athlete-', 'athlete-'))
    // bookings/profile mobile HTML go under athlete-bookings / athlete-hub
    const outDir = screen.tab === 'bookings'
      ? path.join(OUT, 'athlete-bookings')
      : screen.tab === 'profile'
        ? path.join(OUT, 'athlete-hub')
        : path.join(OUT, 'm-athlete')
    fs.mkdirSync(outDir, { recursive: true })
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    await prepHtml(page)
    await page.evaluate((tab) => {
      window.go('m-athlete')
      window.scrollTo(0, 0)
      if (tab && typeof window.showTab === 'function') window.showTab(tab)
    }, screen.tab)
    await page.waitForTimeout(700)
    const phone = await page.$('#m1.mphone, #m1')
    const fileName = screen.tab === 'bookings'
      ? 'html-athlete-bookings-m-375.png'
      : screen.tab === 'profile'
        ? 'html-athlete-hub-m-375.png'
        : 'html-m-athlete-375.png'
    await shot(page, path.join(outDir, fileName), phone)
    await context.close()
  }
}

async function captureLive(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  const screens = [
    { id: 'athlete-home', route: '/athlete/home', wait: '.canva-photo-hero, .canva-search-row' },
    { id: 'athlete-bookings', route: '/athlete/bookings', wait: '.canva-history-title, .canva-home-chrome' },
    { id: 'athlete-hub', route: '/athlete', wait: '.canva-athlete-hub, .canva-dash-hero' },
    { id: 'athlete-wallet', route: '/athlete/wallet', wait: 'h1, .canva-finance-hero-card, .canva-wallet' },
  ]

  // One login per viewport — reuse cookies across routes (avoid OTP rate limits).
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'fa-IR',
    })
    const page = await context.newPage()
    try {
      await loginAthlete(page, base)
    } catch (e) {
      console.error(`login fail ${vp.label}:`, e.message)
      await context.close()
      continue
    }
    for (const screen of screens) {
      const dir = path.join(OUT, screen.id)
      fs.mkdirSync(dir, { recursive: true })
      const url = new URL(screen.route, base).href
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch((e) => {
        console.error(`live fail ${url}:`, e.message)
        return null
      })
      if (!res) continue
      await page.waitForSelector(screen.wait, { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(1000)
      const file = path.join(dir, `live-${screen.id}-${vp.label}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log(`wrote ${path.relative(ROOT, file)}`)
    }
    if (vp.label === '375') {
      const mDir = path.join(OUT, 'm-athlete')
      fs.mkdirSync(mDir, { recursive: true })
      await page.goto(new URL('/athlete/home', base).href, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForSelector('.canva-photo-hero', { timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(mDir, 'live-m-athlete-375.png'), fullPage: false })
      console.log(`wrote ${path.relative(ROOT, path.join(mDir, 'live-m-athlete-375.png'))}`)
    }
    await context.close()
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  console.log('base', opts.base)
  const browser = await chromium.launch({ headless: true })
  try {
    await captureHtml(browser)
    await captureLive(browser, opts)
  } finally {
    await browser.close()
  }
  console.log('done →', path.relative(ROOT, OUT))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
