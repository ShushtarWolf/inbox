#!/usr/bin/env node
/**
 * Guard against iOS Safari tap regressions (overflow clip, visualViewport overlays).
 * Run in CI before build.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const errors = []

function rg(pattern, paths, { ignoreComments = false } = {}) {
  try {
    const out = execSync(`rg -n "${pattern}" ${paths}`, { encoding: 'utf8' }).trim()
    if (!out) return []
    return out.split('\n').filter((line) => {
      if (!ignoreComments) return true
      const body = line.split(':').slice(2).join(':').trim()
      return body && !body.startsWith('/*') && !body.startsWith('*') && !body.startsWith('//')
    })
  } catch {
    return []
  }
}

for (const line of rg('overflow-x:\\s*clip|overflow-x-clip', 'app nuxt.config.ts')) {
  if (line.includes('overflow-x: hidden') || line.includes('incorrectly')) continue
  errors.push(`overflow-x clip (Safari hit-test bug): ${line}`)
}

for (const line of rg('vvTop|overlayStyle', 'app/components')) {
  errors.push(`visualViewport overlay positioning (use AppModal inset-0 only): ${line}`)
}

const css = readFileSync('app/assets/css/main.css', 'utf8')
const requiredPointerNone = [
  '.canva-hero-media',
  '.canva-photo-hero-media',
  '.canva-photo-hero-wash',
  '.canva-club-gallery-media',
  '.canva-fav-card-media',
  '.canva-fav-card-wash',
  '.canva-venue-card img',
  '.canva-competition-card img',
  '.canva-court-card img',
]
for (const selector of requiredPointerNone) {
  const idx = css.indexOf(selector)
  if (idx === -1) {
    errors.push(`missing selector in main.css: ${selector}`)
    continue
  }
  const block = css.slice(idx, idx + 280)
  if (!block.includes('pointer-events-none')) {
    errors.push(`${selector} must include pointer-events-none (Safari tap barrier)`)
  }
}

if (!css.includes('.page-enter-active')) {
  errors.push('missing .page-enter-active in main.css')
} else {
  const enterIdx = css.indexOf('.page-enter-active')
  const enterBlock = css.slice(enterIdx, enterIdx + 400)
  if (!enterBlock.includes('pointer-events: none') && !enterBlock.includes('pointer-events-none')) {
    errors.push('page route transition must set pointer-events: none on .page-enter-active')
  }
}
if (!css.includes('.venus-modal-leave-active') || !css.includes('pointer-events: none !important')) {
  errors.push('modal transition must set pointer-events: none on .venus-modal-leave-active')
}

if (errors.length) {
  console.error('[check:ios-hit-testing] FAILED\n')
  for (const err of errors) console.error(`  • ${err}`)
  process.exit(1)
}

console.log('[check:ios-hit-testing] OK')
