#!/usr/bin/env node
/**
 * Screenshot HTML vs live owner-calendar Today grid @375 + desktop.
 * Usage: node scripts/check-html-owner-calendar-slice.mjs [--base http://[::1]:3000]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_PATH = path.join(ROOT, 'design-reference/inbox-all-pages-html/prototype.html')
const OUT = path.join(ROOT, 'design-reference/comparisons/owner-calendar')

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

async function captureHtml(browser) {
  fs.mkdirSync(OUT, { recursive: true })
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    await prepHtml(page)
    if (vp.label === '375') {
      await page.evaluate(() => {
        window.go('m-owner')
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(800)
      const phone = await page.$('#m5.mphone, #m5')
      const file = path.join(OUT, 'html-owner-calendar-m-375.png')
      if (phone) await phone.screenshot({ path: file, timeout: 15_000 })
      else await page.screenshot({ path: file, fullPage: false })
      console.log(`wrote ${path.relative(ROOT, file)}`)
    } else {
      await page.evaluate(() => {
        window.go('owner-calendar')
        if (typeof window.ocRender === 'function') window.ocRender()
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(700)
      const el = await page.$('#pg-owner-calendar .dash, #pg-owner-calendar')
      const file = path.join(OUT, 'html-owner-calendar-desktop.png')
      if (el) await el.screenshot({ path: file, timeout: 15_000 })
      else await page.screenshot({ path: file, fullPage: false })
      console.log(`wrote ${path.relative(ROOT, file)}`)
      // Also a tight grid crop for done-gate
      const grid = await page.$('#ocGrid, #pg-owner-calendar .mx')
      if (grid) {
        const gFile = path.join(OUT, 'html-owner-calendar-grid-desktop.png')
        await grid.screenshot({ path: gFile, timeout: 10_000 })
        console.log(`wrote ${path.relative(ROOT, gFile)}`)
      }
    }
    await context.close()
  }
}

async function captureLive(browser, opts) {
  const base = opts.base.endsWith('/') ? opts.base : `${opts.base}/`
  fs.mkdirSync(OUT, { recursive: true })
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
      console.error('login fail', e.message)
      await context.close()
      continue
    }
    await page.goto(new URL('/owner/calendar', base).href, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForSelector('.canva-cal-grid, .canva-legend-row, .owner-cal-page', { timeout: 25_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const file = path.join(OUT, `live-owner-calendar-${vp.label}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`wrote ${path.relative(ROOT, file)}`)
    const grid = page.locator('.canva-cal-grid, .canva-cal-grid-shell').first()
    if (await grid.count()) {
      const gFile = path.join(OUT, `live-owner-calendar-grid-${vp.label}.png`)
      await grid.screenshot({ path: gFile, timeout: 10_000 }).catch(() => {})
      console.log(`wrote ${path.relative(ROOT, gFile)}`)
    }
    // Header chrome crop (hero top or desk header)
    if (vp.label === '375') {
      const hero = page.locator('.canva-photo-hero').first()
      if (await hero.count()) {
        const hFile = path.join(OUT, 'live-owner-calendar-header-375.png')
        await hero.screenshot({ path: hFile, timeout: 10_000 }).catch(() => {})
        console.log(`wrote ${path.relative(ROOT, hFile)}`)
      }
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
