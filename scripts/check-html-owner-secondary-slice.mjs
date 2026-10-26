#!/usr/bin/env node
/**
 * Screenshot HTML vs live owner secondary NAV screens.
 * Done gate: finance + settings @375 + desktop.
 * Also: crm, equipment, discount, staff, support.
 * Usage: node scripts/check-html-owner-secondary-slice.mjs [--base http://[::1]:3000]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_PATH = path.join(ROOT, 'design-reference/inbox-all-pages-html/prototype.html')
const OUT_ROOT = path.join(ROOT, 'design-reference/comparisons')

const VIEWPORTS = {
  phone: { width: 375, height: 812, label: '375' },
  desk: { width: 1280, height: 900, label: 'desktop' },
}

/** goId → live route + comparisons folder */
const SCREENS = [
  { go: 'owner-finance', route: '/owner/finance', dir: 'owner-finance', wait: '.canva-finance-hero-card, .canva-finance-period, .ofdark' },
  { go: 'owner-settings', route: '/owner/settings', dir: 'owner-settings', wait: '.canva-settings-wide, form, .canva-panel' },
  { go: 'owner-crm', route: '/owner/crm', dir: 'owner-crm', wait: '.canva-crm-stats, .canva-underline-tabs' },
  { go: 'owner-equipment', route: '/owner/equipments', dir: 'owner-equipment', wait: 'h1, .canva-panel, .venus-page-stack' },
  { go: 'owner-discount', route: '/owner/discounts', dir: 'owner-discount', wait: 'h1, .canva-panel, .venus-page-stack' },
  { go: 'owner-staff', route: '/owner/workers', dir: 'owner-staff', wait: 'h1, .canva-panel, .venus-page-stack' },
  { go: 'owner-support', route: '/owner/support', dir: 'owner-support', wait: 'h1, .canva-panel, .venus-page-stack' },
]

function parseArgs(argv) {
  const out = { base: process.env.BASE_URL || 'http://[::1]:3000' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
  }
  return out
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

async function loginOwner(page, base) {
  const res = await page.request.post(new URL('/api/auth/login', base).href, {
    data: { email: 'owner@inbox.local', password: 'demo1234' },
  })
  if (!res.ok()) throw new Error(`owner login ${res.status()}`)
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

async function captureHtml(browser) {
  for (const screen of SCREENS) {
    const dir = path.join(OUT_ROOT, screen.dir)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await prepHtml(page)
      if (vp.label === '375' && (screen.go === 'owner-finance' || screen.go === 'owner-settings')) {
        // Mobile owner shell tabs for done-gate screens
        await page.evaluate((tab) => {
          window.go('m-owner')
          window.scrollTo(0, 0)
          const nav = document.querySelector(`#m5 .mxnav [data-k="${tab}"]`)
          if (nav) nav.click()
        }, screen.go === 'owner-finance' ? 'fin' : 'set')
        await page.waitForTimeout(700)
        const phone = await page.$('#m5.mphone, #m5')
        await shot(page, path.join(dir, `html-${screen.dir}-m-375.png`), phone)
      } else {
        await page.evaluate((id) => {
          window.go(id)
          window.scrollTo(0, 0)
        }, screen.go)
        await page.waitForTimeout(600)
        const el = await page.$(`#pg-${screen.go} .dash, #pg-${screen.go}`)
        await shot(page, path.join(dir, `html-${screen.dir}-${vp.label}.png`), el)
      }
      await context.close()
    }
  }
}

async function captureLive(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  for (const screen of SCREENS) {
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
        await loginOwner(page, base)
      } catch (e) {
        console.error('login fail', screen.go, e.message)
        await context.close()
        continue
      }
      await page.goto(new URL(screen.route, base).href, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForSelector(screen.wait, { timeout: 25_000 }).catch(() => {})
      await page.waitForTimeout(1200)
      const file = path.join(dir, `live-${screen.dir}-${vp.label}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log(`wrote ${path.relative(ROOT, file)}`)
      await context.close()
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  console.log('base', opts.base)
  const chromeForTesting = path.join(
    process.env.HOME || '',
    'Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  )
  const launchOpts = { headless: true }
  if (fs.existsSync(chromeForTesting)) launchOpts.executablePath = chromeForTesting
  const browser = await chromium.launch(launchOpts)
  try {
    await captureHtml(browser)
    await captureLive(browser, opts)
  } finally {
    await browser.close()
  }
  console.log('done →', path.relative(ROOT, OUT_ROOT))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
