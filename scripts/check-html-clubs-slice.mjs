#!/usr/bin/env node
/**
 * Screenshot HTML vs live for clubs / club / confirm @375 + desktop.
 * Usage: node scripts/check-html-clubs-slice.mjs [--base http://localhost:3000] [--slug iust-tennis]
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
  const out = {
    base: process.env.BASE_URL || 'http://localhost:3000',
    slug: 'iust-tennis',
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') out.base = argv[++i]
    else if (argv[i] === '--slug') out.slug = argv[++i]
  }
  return out
}

async function shot(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`wrote ${path.relative(ROOT, filePath)}`)
}

async function prepHtml(page, hideProto = true) {
  const htmlUrl = pathToFileURL(HTML_PATH).href
  await page.goto(htmlUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => typeof window.go === 'function' && document.getElementById('pages'), null, {
    timeout: 30_000,
  })
  if (hideProto) {
    await page.addStyleTag({
      content: '.proto{display:none!important}#pages{padding-top:0!important}',
    })
  }
}

async function captureHtml(browser) {
  for (const screen of ['clubs', 'club', 'confirm']) {
    const dir = path.join(OUT, screen)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await prepHtml(page)
      if (screen === 'confirm') {
        await page.evaluate(() => {
          window.go('club')
          const el = document.getElementById('dcm')
          if (el) el.classList.add('open')
          window.scrollTo(0, 0)
        })
        await page.waitForTimeout(400)
        // Prefer sheet-focused shot (not full page behind)
        const sheet = await page.$('.cmod.open .cmodc, #dcm.open .cmodc, .cmodc')
        if (sheet) {
          await sheet.screenshot({ path: path.join(dir, `html-confirm-${vp.label}.png`) })
          console.log(`wrote ${path.relative(ROOT, path.join(dir, `html-confirm-${vp.label}.png`))} (sheet)`)
        } else {
          await shot(page, path.join(dir, `html-confirm-${vp.label}.png`))
        }
      } else {
        await page.evaluate((id) => {
          window.go(id)
          window.scrollTo(0, 0)
        }, screen)
        await page.waitForTimeout(400)
        await shot(page, path.join(dir, `html-${screen}-${vp.label}.png`))
      }
      await context.close()
    }
  }
}

async function openLiveConfirm(page) {
  await page.waitForSelector('.canva-club-slot, .canva-club-book', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(800)
  // Prefer an enabled free slot (not booked / suspected).
  const freeSlot = page.locator('button.canva-club-slot:not([disabled])').first()
  if (await freeSlot.count()) {
    await freeSlot.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  // Guest CTA may say «ورود برای ادامه» — still opens auth or confirm.
  const cta = page.locator('button.canva-club-book-cta').first()
  if (await cta.count()) {
    const disabled = await cta.isDisabled().catch(() => true)
    if (!disabled) {
      await cta.click({ timeout: 8000 }).catch(() => {})
      await page.waitForTimeout(900)
    }
  }
  // If auth gate opened instead, close it and leave club page for sheet-less shot.
  const gateClose = page.locator('.canva-auth-header button, button:has-text("بستن")').first()
  if (await page.locator('.canva-confirm-book').count() === 0 && await gateClose.count()) {
    // Auth gate is product for guests — still screenshot the gate-less book footer state.
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }
}

async function captureLive(browser, opts) {
  const routes = [
    { screen: 'clubs', route: '/clubs' },
    { screen: 'club', route: `/clubs/${opts.slug}` },
    // Dev hook opens CourtBookingConfirmSheet without auth (see clubs/[slug].vue).
    { screen: 'confirm', route: `/clubs/${opts.slug}?openConfirm=1` },
  ]
  for (const { screen, route } of routes) {
    const dir = path.join(OUT, screen)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: 'fa-IR',
      })
      const page = await context.newPage()
      const url = new URL(route, opts.base.endsWith('/') ? opts.base : `${opts.base}/`).href
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch((e) => {
        console.error(`live fail ${url}:`, e.message)
        return null
      })
      if (!res) {
        await context.close()
        continue
      }
      await page.waitForTimeout(1500)
      if (screen === 'confirm') {
        await page.waitForSelector('.canva-confirm-book', { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(600)
        const sheet = page.locator('.canva-confirm-book').first()
        if (await sheet.count()) {
          await sheet.screenshot({ path: path.join(dir, `live-confirm-${vp.label}.png`) })
          console.log(`wrote ${path.relative(ROOT, path.join(dir, `live-confirm-${vp.label}.png`))} (sheet)`)
        } else {
          await openLiveConfirm(page)
          await shot(page, path.join(dir, `live-confirm-${vp.label}.png`))
        }
      } else {
        await shot(page, path.join(dir, `live-${screen}-${vp.label}.png`))
      }
      await context.close()
    }
    fs.writeFileSync(
      path.join(dir, 'README.md'),
      [
        `# ${screen}`,
        '',
        `- HTML: \`go('${screen === 'confirm' ? 'club + dcm.open' : screen}')\``,
        `- Live: \`${opts.base}${route}\``,
        `- Viewports: 375×812, 1280×900`,
        '',
        `Generated: ${new Date().toISOString()}`,
        '',
      ].join('\n'),
    )
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const browser = await chromium.launch({ headless: true })
  try {
    await captureHtml(browser)
    await captureLive(browser, opts)
  } finally {
    await browser.close()
  }
  console.log('done → design-reference/comparisons/{clubs,club,confirm}')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
