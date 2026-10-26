#!/usr/bin/env node
/**
 * Visual SoT check: screenshot HTML prototype vs live app at phone + desktop.
 *
 * Usage:
 *   npm run check:html -- --screen home --route /
 *   npm run check:html -- --screen clubs --route /clubs --base https://inboxs.ir
 *   npm run check:html -- --screen home --route / --html-only
 *   npm run check:html -- --screen home --route / --live-only
 *
 * Env:
 *   BASE_URL   live app origin (default http://127.0.0.1:3000)
 *   HTML_PATH  absolute path to prototype.html (optional)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DEFAULT_HTML = path.join(ROOT, 'design-reference/inbox-all-pages-html/prototype.html')
const OUT_ROOT = path.join(ROOT, 'design-reference/comparisons')

const VIEWPORTS = {
  phone: { width: 375, height: 812, label: '375' },
  desk: { width: 1280, height: 900, label: 'desktop' },
}

function parseArgs(argv) {
  const out = {
    screen: 'home',
    route: '/',
    base: process.env.BASE_URL || 'http://127.0.0.1:3000',
    htmlPath: process.env.HTML_PATH || DEFAULT_HTML,
    htmlOnly: false,
    liveOnly: false,
    hideProto: true,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--screen') out.screen = argv[++i]
    else if (a === '--route') out.route = argv[++i]
    else if (a === '--base') out.base = argv[++i]
    else if (a === '--html') out.htmlPath = argv[++i]
    else if (a === '--html-only') out.htmlOnly = true
    else if (a === '--live-only') out.liveOnly = true
    else if (a === '--keep-proto-nav') out.hideProto = false
  }
  return out
}

async function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

async function shot(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`wrote ${path.relative(ROOT, filePath)}`)
}

async function captureHtml(browser, opts, outDir) {
  const htmlUrl = pathToFileURL(opts.htmlPath).href
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    await page.goto(htmlUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Wait for pages mount (Object.keys(pages) → #pages)
    await page.waitForFunction(() => {
      return typeof window.go === 'function' && document.getElementById('pages')
    }, null, { timeout: 30_000 })
    if (opts.hideProto) {
      await page.addStyleTag({
        content: '.proto{display:none!important}#pages{padding-top:0!important}',
      })
    }
    await page.evaluate((id) => {
      if (typeof window.go === 'function') window.go(id)
      else {
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'))
        const el = document.getElementById(`pg-${id}`)
        if (el) el.classList.add('active')
      }
      window.scrollTo(0, 0)
    }, opts.screen)
    await page.waitForTimeout(400)
    const active = await page.$(`#pg-${opts.screen}.active, #pg-${opts.screen}`)
    if (!active) {
      console.warn(`warn: #pg-${opts.screen} not found/active — screenshot may be blank`)
    }
    await shot(page, path.join(outDir, `html-${opts.screen}-${vp.label}.png`))
    await context.close()
  }
}

async function captureLive(browser, opts, outDir) {
  const url = new URL(opts.route, opts.base.endsWith('/') ? opts.base : `${opts.base}/`).href
  for (const vp of Object.values(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      locale: 'fa-IR',
    })
    const page = await context.newPage()
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 }).catch((e) => {
      console.error(`live navigate failed (${url}):`, e.message)
      return null
    })
    if (!res) {
      await context.close()
      continue
    }
    await page.waitForTimeout(800)
    await shot(page, path.join(outDir, `live-${opts.screen}-${vp.label}.png`))
    await context.close()
  }
}

async function writeSideBySideNote(outDir, opts) {
  const lines = [
    `# ${opts.screen}`,
    '',
    `- HTML: \`go('${opts.screen}')\` from \`${path.relative(ROOT, opts.htmlPath)}\``,
    `- Live: \`${opts.base}${opts.route}\``,
    `- Viewports: 375×812, 1280×900`,
    '',
    'Open the `html-*` and `live-*` PNGs side by side. Update `design-reference/GAPS.md`.',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ]
  fs.writeFileSync(path.join(outDir, 'README.md'), lines.join('\n'))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!fs.existsSync(opts.htmlPath) && !opts.liveOnly) {
    throw new Error(`prototype not found: ${opts.htmlPath}`)
  }
  const outDir = path.join(OUT_ROOT, opts.screen)
  await ensureDir(outDir)

  const browser = await chromium.launch({ headless: true })
  try {
    if (!opts.liveOnly) await captureHtml(browser, opts, outDir)
    if (!opts.htmlOnly) await captureLive(browser, opts, outDir)
    await writeSideBySideNote(outDir, opts)
  } finally {
    await browser.close()
  }
  console.log(`done → ${path.relative(ROOT, outDir)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
