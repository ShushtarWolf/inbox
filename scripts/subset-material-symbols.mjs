#!/usr/bin/env node
/**
 * Rebuild the self-hosted Material Symbols Rounded subset (~12KB) used by AppIcon.
 * Replaces the full npm `material-symbols` woff2 (~5MB) that often failed on slow phones
 * and showed raw ligature text like "chevron_left".
 *
 * Usage: node scripts/subset-material-symbols.mjs
 * Requires network (fonts.googleapis.com / fonts.gstatic.com).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'fonts')
const outFile = join(outDir, 'material-symbols-rounded-subset.woff2')
const listFile = join(outDir, 'material-symbols-rounded-subset.icons.txt')

/** Extra icons referenced dynamically / as fallbacks (may not match scan heuristics). */
const EXTRA = [
  'circle',
  'expand_more',
  'inbox',
  'lock',
  'notifications_off',
  'sms_failed',
  'toggle_on',
]

const SCAN_ROOTS = ['app', 'modules']
const SCAN_EXTS = new Set(['.vue', '.ts', '.js', '.mjs'])

function walk(dir, files = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.output' || ent.name === 'dist') continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, files)
    else if (SCAN_EXTS.has(extname(ent.name))) files.push(p)
  }
  return files
}

function collectIconNames() {
  const names = new Set(EXTRA)
  const patterns = [
    /AppIcon[^>]*\bname=["']([a-z][a-z0-9_]*)["']/g,
    /\bname=["']([a-z][a-z0-9_]*)["'][^>]*\bAppIcon/g,
    /\bicon:\s*['"`]([a-z][a-z0-9_]*)['"`]/g,
    /\bicon=["']([a-z][a-z0-9_]*)["']/g,
  ]
  const deny = new Set(['enamad', 'page', 'product_schedule', 'website', 'padel', 'tennis', 'icon', 'name'])

  for (const r of SCAN_ROOTS) {
    for (const file of walk(join(root, r))) {
      const text = readFileSync(file, 'utf8')
      if (!text.includes('AppIcon') && !/\bicon\s*[:=]/.test(text)) continue
      for (const re of patterns) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(text))) {
          if (!deny.has(m[1])) names.add(m[1])
        }
      }
      for (const m of text.matchAll(/\?\s*['"]([a-z][a-z0-9_]*)['"]\s*:\s*['"]([a-z][a-z0-9_]*)['"]/g)) {
        if (m[1].includes('_') || m[2].includes('_') || m[1] === 'sms' || m[2] === 'sms') {
          names.add(m[1])
          names.add(m[2])
        }
      }
      for (const m of text.matchAll(/\|\|\s*['"]([a-z][a-z0-9_]*)['"]/g)) {
        if (['circle', 'inbox'].includes(m[1])) names.add(m[1])
      }
    }
  }

  return [...names].filter((n) => /^[a-z][a-z0-9_]*$/.test(n)).sort()
}

async function main() {
  const icons = collectIconNames()
  if (icons.length < 20) {
    throw new Error(`Icon scan found only ${icons.length} names — aborting`)
  }

  const iconNames = icons.join(',')
  const cssUrl =
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,500,0..1,0'
    + `&icon_names=${iconNames}&display=block`

  const cssRes = await fetch(cssUrl, {
    headers: {
      // Google Fonts returns woff2 only for modern UA strings.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })
  if (!cssRes.ok) throw new Error(`Google Fonts CSS failed: ${cssRes.status}`)
  const css = await cssRes.text()
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/)
  if (!match) throw new Error('Could not find woff2 URL in Google Fonts CSS')

  const fontRes = await fetch(match[1], {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  })
  if (!fontRes.ok) throw new Error(`Font download failed: ${fontRes.status}`)
  const buf = Buffer.from(await fontRes.arrayBuffer())
  if (buf.byteLength < 1000) throw new Error(`Font too small (${buf.byteLength} bytes)`)

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outFile, buf)
  writeFileSync(listFile, `${icons.join('\n')}\n`)

  console.log(`Wrote ${outFile} (${buf.byteLength} bytes, ${icons.length} icons)`)
  console.log(`Icon list: ${listFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
