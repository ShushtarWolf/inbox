#!/usr/bin/env node
/**
 * Screenshot HTML vs live coach: today, schedule, book + m-coach header.
 * Done gate: coach today + schedule @375 + desktop.
 * Usage: node scripts/check-html-coach-slice.mjs [--base http://[::1]:3000]
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

const SCREENS = [
  { go: 'coach', route: '/coach', dir: 'coach', wait: '.coach-dash-welcome, .cxh, h1', mTab: 'today' },
  { go: 'coach-schedule', route: '/coach/schedule', dir: 'coach-schedule', wait: '.canva-legend-row, .cxrows, h1', mTab: 'schedule' },
  { go: 'coach-book', route: '/coach/book', dir: 'coach-book', wait: 'h1, form, .cxbox', mTab: 'book' },
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

async function loginCoach(page, base) {
  const res = await page.request.post(new URL('/api/auth/login', base).href, {
    data: { email: 'coach@inbox.local', password: 'demo1234' },
  })
  if (!res.ok()) throw new Error(`coach login ${res.status()}`)
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
      if (vp.label === '375') {
        await page.evaluate((tab) => {
          window.go('m-coach')
          window.scrollTo(0, 0)
          const nav = document.querySelector(`#m3 .mxnav [data-k="${tab}"]`)
          if (nav) nav.click()
        }, screen.mTab)
        await page.waitForTimeout(800)
        const phone = await page.$('#m3.mphone, #m3')
        await shot(page, path.join(dir, `html-${screen.dir}-m-375.png`), phone)
        if (screen.go === 'coach') {
          const header = await page.$('#m3 .mxban, #m3 .mxt')
          if (header) {
            await header.screenshot({ path: path.join(dir, 'html-m-coach-header-375.png'), timeout: 10_000 }).catch(() => {})
            console.log('wrote html-m-coach-header-375.png')
          }
        }
      } else {
        await page.evaluate((id) => {
          window.go(id)
          if (id === 'coach-schedule' && typeof window.cxSched === 'function') window.cxSched()
          window.scrollTo(0, 0)
        }, screen.go)
        await page.waitForTimeout(600)
        const el = await page.$(`#pg-${screen.go} .dash, #pg-${screen.go}`)
        await shot(page, path.join(dir, `html-${screen.dir}-desktop.png`), el)
      }
      await context.close()
    }
  }
}

async function captureLive(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  const chromeForTesting = path.join(
    process.env.HOME || '',
    'Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  )
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
        await loginCoach(page, base)
      } catch (e) {
        console.error('login fail', screen.go, e.message)
        await context.close()
        continue
      }
      await page.goto(new URL(screen.route, base).href, { waitUntil: 'load', timeout: 120_000 })
      await page.waitForSelector(screen.wait, { timeout: 30_000 }).catch(() => {})
      await page.waitForTimeout(1400)
      const file = path.join(dir, `live-${screen.dir}-${vp.label}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log(`wrote ${path.relative(ROOT, file)}`)
      if (screen.go === 'coach' && vp.label === '375') {
        const hero = page.locator('.canva-photo-hero').first()
        if (await hero.count()) {
          await hero.screenshot({ path: path.join(dir, 'live-m-coach-header-375.png'), timeout: 10_000 }).catch(() => {})
          console.log('wrote live-m-coach-header-375.png')
        }
      }
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
