#!/usr/bin/env node
/**
 * Full Canva pixel review at 375×812 — all non-blank frames, rule-adjusted scoring.
 *
 * Usage:
 *   npm run check:canva
 *   node scripts/canva-pixel-compare.mjs --capture-only
 *   node scripts/canva-pixel-compare.mjs --diff-only
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { BLANK_CANVA_FILES, RULE_NOTES, buildFrames } from './canva-frames.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CANVA_DIR = path.join(ROOT, 'canva-reference/pages')
const OUT_DIR = path.join(ROOT, 'canva-reference/comparisons')
const LOCAL_DIR = path.join(OUT_DIR, 'localhost')
const DIFF_DIR = path.join(OUT_DIR, 'diffs')
const OVERLAY_DIR = path.join(OUT_DIR, 'overlays')
const REPORT_JSON = path.join(OUT_DIR, 'report-full-2026-08-27.json')
const REPORT_MD = path.join(OUT_DIR, 'report-full-2026-08-27.md')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000'
const VIEWPORT = { width: 375, height: 812 }
const DEMO_PASSWORD = 'demo1234'

const FRAMES = buildFrames(BASE_URL)

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath))
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png))
}

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

function blendOverlay(a, b) {
  const out = new PNG({ width: a.width, height: a.height })
  for (let i = 0; i < a.data.length; i += 4) {
    out.data[i] = Math.round((a.data[i] + b.data[i]) / 2)
    out.data[i + 1] = Math.round((a.data[i + 1] + b.data[i + 1]) / 2)
    out.data[i + 2] = Math.round((a.data[i + 2] + b.data[i + 2]) / 2)
    out.data[i + 3] = 255
  }
  return out
}

function severityFromSimilarity(score) {
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
  if (rules.includes('pilot-no-recurring')) bonus += 6
  if (rules.includes('selection-bar-not-fab')) bonus += 4
  if (rules.includes('overlay-artboard')) bonus += 10
  if (rules.includes('sheet-modal')) bonus += 4
  if (rules.includes('thin-frame')) bonus += 5
  return Math.min(99, Math.round(raw + bonus))
}

async function loginWithPassword(context, email) {
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: DEMO_PASSWORD },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`Login failed (${res.status()}): ${body.slice(0, 200)}`)
  }
}

function listCanvaInventory() {
  if (!fs.existsSync(CANVA_DIR)) return []
  return fs.readdirSync(CANVA_DIR).filter((f) => f.endsWith('.png')).sort()
}

function blankInventory() {
  return listCanvaInventory().filter((f) => BLANK_CANVA_FILES.has(f)).map((file) => ({
    canva: file,
    status: 'skipped-blank',
    bytes: fs.statSync(path.join(CANVA_DIR, file)).size,
  }))
}

function unmappedCanva(mappedFiles) {
  return listCanvaInventory()
    .filter((f) => !BLANK_CANVA_FILES.has(f) && !mappedFiles.has(f))
    .map((file) => ({ canva: file, status: 'unmapped' }))
}

const ONLY_IDS = process.env.CANVA_ONLY?.split(',').filter(Boolean)

async function captureScreenshots() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true })
  const browser = await chromium.launch()
  let ok = 0
  let fail = 0

  for (const frame of FRAMES) {
    if (ONLY_IDS?.length && !ONLY_IDS.includes(frame.id)) continue
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
        console.error(`[capture] ${frame.id} athlete login FAILED:`, err instanceof Error ? err.message : err)
        fail++
        await context.close()
        continue
      }
    } else if (frame.auth === 'owner') {
      try {
        await loginWithPassword(context, 'owner@inbox.local')
      } catch (err) {
        console.error(`[capture] ${frame.id} owner login FAILED:`, err instanceof Error ? err.message : err)
        fail++
        await context.close()
        continue
      }
    }

    try {
      await page.goto(`${BASE_URL}${frame.path}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(800)
      if (frame.prepare) await frame.prepare(page)
      await page.waitForTimeout(500)

      const outPath = path.join(LOCAL_DIR, `app-${frame.id}.png`)
      await page.screenshot({ path: outPath, fullPage: false })
      console.log(`[capture] ${frame.id} (${frame.canva})`)
      ok++
    } catch (err) {
      console.error(`[capture] ${frame.id} FAILED:`, err instanceof Error ? err.message : err)
      fail++
    } finally {
      await context.close()
    }
  }

  await browser.close()
  console.log(`\n[capture] done: ${ok} ok, ${fail} failed, ${FRAMES.length} total`)
}

function runDiffs() {
  fs.mkdirSync(DIFF_DIR, { recursive: true })
  fs.mkdirSync(OVERLAY_DIR, { recursive: true })

  const results = []
  const mappedFiles = new Set()

  for (const frame of FRAMES) {
    mappedFiles.add(frame.canva)
    const canvaPath = path.join(CANVA_DIR, frame.canva)
    const appPath = path.join(LOCAL_DIR, `app-${frame.id}.png`)
    const entry = {
      id: frame.id,
      canva: frame.canva,
      category: frame.category || 'page',
      element: frame.element || frame.id,
      route: frame.path,
      rules: frame.rules || [],
      ruleNotes: (frame.rules || []).map((r) => RULE_NOTES[r]).filter(Boolean),
    }

    if (!fs.existsSync(canvaPath)) {
      entry.status = 'error'
      entry.error = `Missing Canva: ${frame.canva}`
      results.push(entry)
      continue
    }
    if (!fs.existsSync(appPath)) {
      entry.status = 'error'
      entry.error = `Missing capture: app-${frame.id}.png`
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
    const adjustedSimilarity = adjustedScore(rawSimilarity, frame.rules || [])
    const severity = severityFromSimilarity(adjustedSimilarity)

    writePng(path.join(DIFF_DIR, `diff-${frame.id}.png`), diff)
    writePng(path.join(OVERLAY_DIR, `overlay-${frame.id}.png`), blendOverlay(canva, app))

    entry.status = 'compared'
    entry.rawSimilarityPct = rawSimilarity
    entry.adjustedSimilarityPct = adjustedSimilarity
    entry.severity = severity
    results.push(entry)
    console.log(`[diff] ${frame.id}: ${rawSimilarity}% → ${adjustedSimilarity}% (${severity})`)
  }

  const blanks = blankInventory()
  const unmapped = unmappedCanva(mappedFiles)

  const summary = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    totals: {
      frames: FRAMES.length,
      compared: results.filter((r) => r.status === 'compared').length,
      errors: results.filter((r) => r.status === 'error').length,
      blanks: blanks.length,
      unmapped: unmapped.length,
      okEnough: results.filter((r) => r.severity === 'ok-enough').length,
      visual: results.filter((r) => r.severity === 'visual').length,
      visualMajor: results.filter((r) => r.severity === 'visual-major').length,
      blocker: results.filter((r) => r.severity === 'blocker').length,
    },
    blanks,
    unmapped,
    results,
  }

  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(summary, null, 2)}\n`)
  writeMarkdownReport(summary)
  console.log(`\nReport: ${path.relative(ROOT, REPORT_MD)}`)
}

function writeMarkdownReport(summary) {
  const { results, blanks, unmapped, totals } = summary
  const byCategory = (cat) => results.filter((r) => r.category === cat && r.status === 'compared')

  const lines = [
    '# Full Canva pixel review — Aug 27 export',
    '',
    `Generated: ${summary.generatedAt}`,
    `Viewport: ${summary.viewport.width}×${summary.viewport.height}`,
    '',
    '## Executive summary',
    '',
    '| Metric | Count |',
    '|--------|------:|',
    `| Frames compared | ${totals.compared} |`,
    `| Capture errors | ${totals.errors} |`,
    `| Blank Canva artboards skipped | ${totals.blanks} |`,
    `| Unmapped Canva files | ${totals.unmapped} |`,
    `| **ok-enough** (≥88% adjusted) | ${totals.okEnough} |`,
    `| **visual** (72–87%) | ${totals.visual} |`,
    `| **visual-major** (55–71%) | ${totals.visualMajor} |`,
    `| **blocker** (<55% adjusted) | ${totals.blocker} |`,
    '',
    '### LOCKED UX rules (always apply — not pixel regressions)',
    '',
    '1. **Square chrome** — 0–2px radius on Canva phone frames; softer Canva mock ≠ bug.',
    '2. **Required chrome** — bottom nav, logo, back escapes stay even if Canva omits them.',
    '3. **Owner Today** — closed tab = multi-court **GRID** (`home page (9)`), not list-day overlay artboards.',
    '4. **Selection bar** — Reserve/Block after slot tap; not always-visible left FAB stack.',
    '5. **Behnaz MVP** — no Google OAuth, no coach product, no recurring/season sheets in live UI.',
    '6. **iOS hit-testing** — AppModal fixed overlay; decorative layers use `pointer-events-none`.',
    '7. **Dynamic content** — demo club names/photos/dates differ from Canva placeholder art.',
    '',
    '## All compared frames',
    '',
    '| ID | Category | Canva | Route | Raw % | Adj % | Severity |',
    '|----|----------|-------|-------|------:|------:|----------|',
  ]

  for (const r of results) {
    if (r.status === 'error') {
      lines.push(`| ${r.id} | ${r.category} | ${r.canva} | \`${r.route}\` | — | — | **error** |`)
      continue
    }
    lines.push(`| ${r.id} | ${r.category} | ${r.canva} | \`${r.route}\` | ${r.rawSimilarityPct} | ${r.adjustedSimilarityPct} | ${r.severity} |`)
  }

  for (const cat of ['page', 'sheet', 'modal', 'overlay']) {
    const items = byCategory(cat)
    if (!items.length) continue
    lines.push('', `## ${cat.charAt(0).toUpperCase() + cat.slice(1)}s (${items.length})`, '')
    for (const r of items.sort((a, b) => b.adjustedSimilarityPct - a.adjustedSimilarityPct)) {
      lines.push(`- **${r.id}** (\`${r.canva}\`) — adj **${r.adjustedSimilarityPct}%** (${r.severity}) · \`overlay-${r.id}.png\``)
      for (const note of r.ruleNotes || []) lines.push(`  - ${note}`)
    }
  }

  if (blanks.length) {
    lines.push('', `## Skipped blank artboards (${blanks.length})`, '')
    for (const b of blanks) lines.push(`- \`${b.canva}\` (${b.bytes} bytes)`)
  }

  if (unmapped.length) {
    lines.push('', `## Unmapped Canva files (${unmapped.length})`, '')
    for (const u of unmapped) lines.push(`- \`${u.canva}\``)
  }

  lines.push('', '## Artifacts', '')
  lines.push('- `canva-reference/comparisons/localhost/app-*.png`')
  lines.push('- `canva-reference/comparisons/diffs/diff-*.png`')
  lines.push('- `canva-reference/comparisons/overlays/overlay-*.png`')
  lines.push('', 'Re-run: `npm run check:canva`')

  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`)
}

const args = process.argv.slice(2)
const captureOnly = args.includes('--capture-only')
const diffOnly = args.includes('--diff-only')

if (!diffOnly) await captureScreenshots()
if (!captureOnly) runDiffs()
