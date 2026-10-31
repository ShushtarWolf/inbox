#!/usr/bin/env node
/**
 * Guard against re-introducing decorative STUDENT20 / ۲۰٪ student promo UI.
 * Real discount codes, owner discount admin, and checkout apply flows are allowed.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const errors = []

function rg(pattern, paths) {
  try {
    const out = execSync(`rg -n "${pattern}" ${paths}`, { encoding: 'utf8' }).trim()
    return out ? out.split('\n') : []
  }
  catch {
    return []
  }
}

const vueHits = [
  ...rg('canva-promo-badge|canva-promo-strip|canva-venue-card-offer', 'app --glob "*.vue"'),
  ...rg('homePromo|calendarPromo|pilotStudentOffer', 'app --glob "*.{vue,ts}"'),
  ...rg('تخفیف دانشجویی', 'app --glob "*.vue"'),
]

for (const line of vueHits) {
  errors.push(`decorative student promo UI in app: ${line}`)
}

const fa = readFileSync('i18n/locales/fa.json', 'utf8')
for (const key of [
  'homePromo',
  'homePromoShort',
  'calendarPromo',
  'calendarPromoShort',
  'calendarPromoHint',
  'pilotStudentOffer',
]) {
  if (fa.includes(`"${key}"`)) {
    errors.push(`remove unused decorative i18n key: ${key}`)
  }
}

if (errors.length) {
  console.error('check-no-student-promo-ui failed:\n')
  for (const err of errors) console.error(`  - ${err}`)
  process.exit(1)
}

console.log('check-no-student-promo-ui: OK (no decorative student promo UI in app)')
