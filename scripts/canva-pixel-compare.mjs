#!/usr/bin/env node
/**
 * Capture localhost at 375×812 and pixel-compare against canva-reference/pages/.
 * Respects product rules: square Canva chrome (0–2px radius), required nav chrome,
 * owner Today = multi-court GRID (home page (9)), not list-day overlays.
 *
 * Usage:
 *   node scripts/canva-pixel-compare.mjs
 *   node scripts/canva-pixel-compare.mjs --capture-only
 *   node scripts/canva-pixel-compare.mjs --diff-only
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CANVA_DIR = path.join(ROOT, 'canva-reference/pages')
const OUT_DIR = path.join(ROOT, 'canva-reference/comparisons')
const LOCAL_DIR = path.join(OUT_DIR, 'localhost')
const DIFF_DIR = path.join(OUT_DIR, 'diffs')
const OVERLAY_DIR = path.join(OUT_DIR, 'overlays')
const REPORT_JSON = path.join(OUT_DIR, 'report-2026-08-27.json')
const REPORT_MD = path.join(OUT_DIR, 'report-2026-08-27.md')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000'
const VIEWPORT = { width: 375, height: 812 }

/** MVP primary frames — see canva-reference/MAP.md */
const FRAMES = [
  {
    id: 'public-home',
    canva: 'home page.png',
    path: '/',
    rules: ['chrome-required'],
  },
  {
    id: 'clubs-list',
    canva: 'Court list.png',
    path: '/clubs',
    rules: ['dynamic-content'],
  },
  {
    id: 'club-detail',
    canva: 'home page (3).png',
    path: '/clubs/padel-zone-tehran',
    rules: ['dynamic-content'],
  },
  {
    id: 'auth-gate',
    canva: 'login_sign up.png',
    path: '/',
    prepare: async (page) => {
      await page.evaluate(() => {
        const btn = document.querySelector('.canva-home-chrome .canva-home-login')
        btn?.click()
      })
      await page.locator('.canva-gate-btn-primary, .canva-gate-btn-secondary').first().waitFor({ timeout: 15_000 })
    },
    rules: ['no-google-expected', 'square-radius-expected'],
  },
  {
    id: 'auth-role',
    canva: '4.png',
    path: '/register',
    prepare: async (page) => {
      await page.locator('.canva-role-card').first().waitFor({ timeout: 20_000 })
    },
    rules: ['pilot-no-coach', 'square-radius-expected'],
  },
  {
    id: 'athlete-hub',
    canva: 'home page (5).png',
    path: '/athlete',
    auth: 'athlete',
    rules: ['chrome-required'],
  },
  {
    id: 'athlete-bookings',
    canva: 'home page (7).png',
    path: '/athlete/bookings',
    auth: 'athlete',
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-calendar-grid',
    canva: 'home page (9).png',
    path: '/owner/calendar',
    auth: 'owner',
    rules: ['grid-not-list', 'dynamic-content', 'selection-bar-not-fab'],
  },
  {
    id: 'owner-calendar-overview',
    canva: 'changed.png',
    path: '/owner/calendar',
    auth: 'owner',
    prepare: async (page) => {
      await page.getByRole('button', { name: /نمای کلی|overview/i }).click()
      await page.waitForTimeout(1500)
    },
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-finance',
    canva: 'home page (26).png',
    path: '/owner/finance',
    auth: 'owner',
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-crm',
    canva: 'home page (28).png',
    path: '/owner/crm',
    auth: 'owner',
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-equipments',
    canva: 'home page (30).png',
    path: '/owner/equipments',
    auth: 'owner',
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-settings',
    canva: 'افزودن زمین.png',
    path: '/owner/settings',
    auth: 'owner',
    rules: ['dynamic-content'],
  },
  {
    id: 'owner-finance-report',
    canva: 'گزارش پیشرفته.png',
    path: '/owner/finance/report',
    auth: 'owner',
    rules: ['dynamic-content'],
  },
]

const RULE_NOTES = {
  'chrome-required': 'Extra bottom nav / logo chrome is required in product — not a regression.',
  'square-radius-expected': 'App uses 0–2px Canva LOCKED radius; Canva mock may look softer.',
  'no-google-expected': 'Google OAuth shown in Canva but hard-off in product (Behnaz MVP).',
  'pilot-no-coach': 'Coach role hidden when PILOT_NO_COACH=true.',
  'dynamic-content': 'Club names, dates, booking rows differ from static Canva art.',
  'grid-not-list': 'Closed Today must be multi-court GRID, not list-day overlay artboard.',
  'selection-bar-not-fab': 'Reserve/Block use bottom selection bar after tap, not always-visible left FABs.',
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath))
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png))
}

/** Crop both images to shared top-left region (phone artboard). */
function alignPair(canva, app) {
  const width = Math.min(canva.width, app.width)
  const height = Math.min(canva.height, app.height)
  function crop(src) {
    const out = new PNG({ width, height })
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = ((src.width * y) + x) << 2
        const di = ((width * y) + x) << 2
        out.data[di] = src.data[si]
        out.data[di + 1] = src.data[si + 1]
        out.data[di + 2] = src.data[si + 2]
        out.data[di + 3] = src.data[si + 3]
      }
    }
    return out
  }
  return { canva: crop(canva), app: crop(app), width, height }
}

function blendOverlay(a, b, width, height) {
  const out = new PNG({ width, height })
  for (let i = 0; i < a.data.length; i += 4) {
    out.data[i] = Math.round((a.data[i] + b.data[i]) / 2)
    out.data[i + 1] = Math.round((a.data[i + 1] + b.data[i + 1]) / 2)
    out.data[i + 2] = Math.round((a.data[i + 2] + b.data[i + 2]) / 2)
    out.data[i + 3] = 255
  }
  return out
}

function severityFromSimilarity(raw, adjusted) {
  const score = adjusted ?? raw
  if (score >= 88) return 'ok-enough'
  if (score >= 72) return 'visual'
  if (score >= 55) return 'visual-major'
  return 'blocker'
}

function adjustedScore(raw, rules) {
  let bonus = 0
  if (rules.includes('dynamic-content')) bonus += 8
  if (rules.includes('square-radius-expected')) bonus += 5
  if (rules.includes('chrome-required')) bonus += 4
  if (rules.includes('no-google-expected')) bonus += 3
  if (rules.includes('pilot-no-coach')) bonus += 2
  if (rules.includes('selection-bar-not-fab')) bonus += 4
  return Math.min(99, Math.round(raw + bonus))
}

const DEMO_PASSWORD = 'demo1234'

async function loginWithPassword(context, email) {
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: DEMO_PASSWORD },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Login failed (${res.status()}): ${body.slice(0, 200)}`)
  }
}

async function captureScreenshots() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true })
  const browser = await chromium.launch()

  for (const frame of FRAMES) {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: VIEWPORT,
      locale: 'fa-IR',
    })
    const page = await context.newPage()

    if (frame.auth === 'athlete') {
      try {
        await loginWithPassword(context, 'athlete@inbox.local')
      } catch (err) {
        console.error(`[capture] ${frame.id} login (athlete) FAILED:`, err instanceof Error ? err.message : err)
        await context.close()
        continue
      }
    } else if (frame.auth === 'owner') {
      try {
        await loginWithPassword(context, 'owner@inbox.local')
      } catch (err) {
        console.error(`[capture] ${frame.id} login (owner) FAILED:`, err instanceof Error ? err.message : err)
        await context.close()
        continue
      }
    }

    try {
      await page.goto(`${BASE_URL}${frame.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForTimeout(1200)
      if (frame.prepare) await frame.prepare(page)
      await page.waitForTimeout(600)

      const outPath = path.join(LOCAL_DIR, `app-${frame.id}.png`)
      await page.screenshot({ path: outPath, fullPage: false })
      console.log(`[capture] ${frame.id} → ${path.relative(ROOT, outPath)}`)
    } catch (err) {
      console.error(`[capture] ${frame.id} FAILED:`, err instanceof Error ? err.message : err)
    } finally {
      await context.close()
    }
  }

  await browser.close()
}

function runDiffs() {
  fs.mkdirSync(DIFF_DIR, { recursive: true })
  fs.mkdirSync(OVERLAY_DIR, { recursive: true })

  const results = []

  for (const frame of FRAMES) {
    const canvaPath = path.join(CANVA_DIR, frame.canva)
    const appPath = path.join(LOCAL_DIR, `app-${frame.id}.png`)
    const entry = {
      id: frame.id,
      canva: frame.canva,
      route: frame.path,
      rules: frame.rules,
      ruleNotes: frame.rules.map((r) => RULE_NOTES[r]).filter(Boolean),
    }

    if (!fs.existsSync(canvaPath)) {
      entry.error = `Missing Canva: ${frame.canva}`
      results.push(entry)
      continue
    }
    if (!fs.existsSync(appPath)) {
      entry.error = `Missing capture: app-${frame.id}.png (run without --diff-only first)`
      results.push(entry)
      continue
    }

    const { canva, app, width, height } = alignPair(readPng(canvaPath), readPng(appPath))
    const diff = new PNG({ width, height })
    const diffPixels = pixelmatch(canva.data, app.data, diff.data, width, height, {
      threshold: 0.12,
      includeAA: false,
    })
    const total = width * height
    const rawSimilarity = Math.round((1 - diffPixels / total) * 1000) / 10
    const adjustedSimilarity = adjustedScore(rawSimilarity, frame.rules)
    const severity = severityFromSimilarity(rawSimilarity, adjustedSimilarity)

    writePng(path.join(DIFF_DIR, `diff-${frame.id}.png`), diff)
    writePng(path.join(OVERLAY_DIR, `overlay-${frame.id}.png`), blendOverlay(canva, app, width, height))

    entry.width = width
    entry.height = height
    entry.diffPixels = diffPixels
    entry.rawSimilarityPct = rawSimilarity
    entry.adjustedSimilarityPct = adjustedSimilarity
    entry.severity = severity
    results.push(entry)
    console.log(
      `[diff] ${frame.id}: raw ${rawSimilarity}% → adjusted ${adjustedSimilarity}% (${severity})`,
    )
  }

  fs.writeFileSync(REPORT_JSON, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`)

  const lines = [
    '# Canva pixel comparison — 2026-08-27 export',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Viewport: ${VIEWPORT.width}×${VIEWPORT.height}`,
    `Canva source: \`inbox website (2).zip\` → \`canva-reference/pages/\``,
    '',
    '## Rule-adjusted scoring',
    '',
    'Raw % = pixelmatch on aligned 375×812 crops. **Adjusted %** adds tolerance for LOCKED product rules (square radius, dynamic DB content, required chrome, MVP gates).',
    '',
    '| Screen | Canva | Route | Raw % | Adjusted % | Severity |',
    '|--------|-------|-------|------:|-----------:|----------|',
  ]

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.id} | ${r.canva} | ${r.route} | — | — | **error** |`)
      continue
    }
    lines.push(
      `| ${r.id} | ${r.canva} | \`${r.route}\` | ${r.rawSimilarityPct} | ${r.adjustedSimilarityPct} | ${r.severity} |`,
    )
  }

  lines.push('', '## Per-frame notes', '')
  for (const r of results) {
    lines.push(`### ${r.id}`)
    if (r.error) {
      lines.push(`- **Error:** ${r.error}`)
      lines.push('')
      continue
    }
    lines.push(`- Canva: \`${r.canva}\``)
    lines.push(`- Raw similarity: **${r.rawSimilarityPct}%**`)
    lines.push(`- Adjusted similarity: **${r.adjustedSimilarityPct}%** (${r.severity})`)
    lines.push(`- Diff: \`comparisons/diffs/diff-${r.id}.png\``)
    lines.push(`- Overlay: \`comparisons/overlays/overlay-${r.id}.png\``)
    for (const note of r.ruleNotes || []) lines.push(`- ${note}`)
    lines.push('')
  }

  lines.push('## Artifacts', '')
  lines.push('- Captures: `canva-reference/comparisons/localhost/app-*.png`')
  lines.push('- Diffs: `canva-reference/comparisons/diffs/`')
  lines.push('- Overlays: `canva-reference/comparisons/overlays/`')
  lines.push('')
  lines.push('Re-run: `npm run check:canva`')

  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`)
  console.log(`\nReport: ${path.relative(ROOT, REPORT_MD)}`)
}

const args = process.argv.slice(2)
const captureOnly = args.includes('--capture-only')
const diffOnly = args.includes('--diff-only')

if (!diffOnly) {
  await captureScreenshots()
}
if (!captureOnly) {
  runDiffs()
}
