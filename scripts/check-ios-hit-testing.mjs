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
if (!css.includes('.venus-modal-enter-active')) {
  errors.push('missing .venus-modal-enter-active in main.css')
} else {
  const enterIdx = css.indexOf('.venus-modal-enter-active')
  const enterBlock = css.slice(enterIdx, enterIdx + 220)
  if (!enterBlock.includes('pointer-events: none') && !enterBlock.includes('pointer-events-none')) {
    errors.push('modal transition must set pointer-events: none on .venus-modal-enter-active')
  }
}

/** Programmatic file pickers must not remain hittable on iOS Safari after the photo sheet returns. */
const filePickerComponents = [
  'app/components/AppImageUpload.vue',
  'app/components/AppImageGallery.vue',
  'app/components/owner/PhotoSlots.vue',
  'app/components/AuthFlowModal.vue',
  'app/pages/admin/withdrawals/index.vue',
]
for (const file of filePickerComponents) {
  const src = readFileSync(file, 'utf8')
  const chunks = src.split(/type=["']file["']/)
  for (let i = 1; i < chunks.length; i++) {
    const nearby = chunks[i].slice(0, 280)
    if (!nearby.includes('pointer-events-none')) {
      errors.push(`${file}: <input type="file"> must include pointer-events-none (opened via .click() only)`)
    }
  }
}

if (!readFileSync('app/utils/modalBodyLock.ts', 'utf8').includes('acquireModalBodyLock')) {
  errors.push('missing shared modal body lock helper (nested AppModal overflow)')
}
const appModal = readFileSync('app/components/AppModal.vue', 'utf8')
if (!appModal.includes('acquireModalBodyLock') || !appModal.includes('releaseModalBodyLock')) {
  errors.push('AppModal must use shared modalBodyLock for nested sheets')
}
const cropSheet = readFileSync('app/components/AppAvatarCropSheet.vue', 'utf8')
if (!cropSheet.includes('releasePointerCapture')) {
  errors.push('AppAvatarCropSheet must releasePointerCapture (Safari tap dead-zone after crop)')
}

if (errors.length) {
  console.error('[check:ios-hit-testing] FAILED\n')
  for (const err of errors) console.error(`  • ${err}`)
  process.exit(1)
}

console.log('[check:ios-hit-testing] OK')
