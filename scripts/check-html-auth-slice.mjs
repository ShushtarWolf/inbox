#!/usr/bin/env node
/**
 * Screenshot HTML vs live auth: login, login-otp, choose-role, welcome.
 * Usage: node scripts/check-html-auth-slice.mjs [--base http://localhost:3000]
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
  const out = { base: process.env.BASE_URL || 'http://localhost:3000' }
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
        await clipEl.screenshot({ path: filePath, timeout: 10_000 })
        console.log(`wrote ${path.relative(ROOT, filePath)}`)
        return
      }
    }
  } catch {
    /* fall through to page shot */
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

async function captureHtml(browser) {
  const screens = [
    { id: 'gate', go: 'login', clip: '.rmod' }, // HTML login chrome ≈ gate/login sheet
    { id: 'login', go: 'login', clip: '.rmod' },
    { id: 'login-otp', go: 'login-otp', clip: '.rmod' },
    { id: 'choose-role', go: 'choose-role', clip: '.authbox' },
    { id: 'welcome', go: 'athlete-home', clip: '.welcome' },
  ]
  for (const screen of screens) {
    const dir = path.join(OUT, screen.id === 'login-otp' ? 'login-otp' : screen.id)
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
      await page.waitForTimeout(700)
      // Modals (.rmod) sit in the active page; dash welcome is .welcome
      const el = (await page.$(`#pg-${screen.go} ${screen.clip}, ${screen.clip}`)) || (await page.$(screen.clip))
      const file = path.join(dir, `html-${screen.id}-${vp.label}.png`)
      if (el) await shot(page, file, el)
      else await shot(page, file, null)
      await context.close()
    }
  }
}

async function captureLive(browser, opts) {
  const screens = [
    { id: 'gate', route: '/?authStep=gate', sheet: true },
    { id: 'login', route: '/?authStep=login', sheet: true },
    { id: 'login-otp', route: '/?authStep=otp', sheet: true },
    { id: 'choose-role', route: '/?authStep=role', sheet: true },
    { id: 'welcome', route: '/?authStep=welcome', sheet: true },
  ]
  for (const screen of screens) {
    const dir = path.join(OUT, screen.id)
    fs.mkdirSync(dir, { recursive: true })
    for (const vp of Object.values(VIEWPORTS)) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        locale: 'fa-IR',
      })
      const page = await context.newPage()
      const url = new URL(screen.route, opts.base.endsWith('/') ? opts.base : `${opts.base}/`).href
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch((e) => {
        console.error(`live fail ${url}:`, e.message)
        return null
      })
      if (!res) {
        await context.close()
        continue
      }
      await page.waitForTimeout(1500)
      const file = path.join(dir, `live-${screen.id}-${vp.label}.png`)
      if (screen.sheet) {
        const sheet = page.locator('.canva-auth-welcome, .canva-auth-body, .venus-modal, [role="dialog"]').first()
        await sheet.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
        const box = page.locator('[role="dialog"], .venus-modal-panel, .canva-result-sheet').first()
        if (await box.count()) {
          await box.screenshot({ path: file }).catch(async () => {
            await page.screenshot({ path: file })
          })
          console.log(`wrote ${path.relative(ROOT, file)} (sheet)`)
        } else {
          await page.screenshot({ path: file })
          console.log(`wrote ${path.relative(ROOT, file)}`)
        }
      } else {
        await page.screenshot({ path: file, fullPage: true })
        console.log(`wrote ${path.relative(ROOT, file)}`)
      }
      await context.close()
    }
    fs.writeFileSync(
      path.join(dir, 'README.md'),
      [
        `# ${screen.id}`,
        '',
        `- Live: \`${opts.base}${screen.route}\``,
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
  console.log('done → design-reference/comparisons/{login,login-otp,choose-role,welcome}')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
