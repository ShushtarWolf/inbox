#!/usr/bin/env node
/** Performance sanity smoke — response time ceilings on key routes. */
import { timedFetch } from './lib/smoke-helpers.mjs'

const base = process.env.BASE_URL || 'http://localhost:3000'

const limits = [
  { label: 'health API', url: `${base}/api/health`, maxMs: 1000 },
  { label: 'sports API', url: `${base}/api/sports`, maxMs: 2000 },
  { label: 'clubs API', url: `${base}/api/clubs`, maxMs: 3000 },
  { label: 'coaches API', url: `${base}/api/coaches`, maxMs: 3000 },
  { label: 'homepage', url: `${base}/`, maxMs: 5000 },
  { label: 'clubs page', url: `${base}/clubs`, maxMs: 5000 },
]

async function main() {
  console.log(`smoke-performance → ${base}`)

  for (const check of limits) {
    const { res, ms } = await timedFetch(check.url)
    if (!res.ok && check.url.includes('/api/')) {
      throw new Error(`${check.label} returned ${res.status}`)
    }
    if (ms > check.maxMs) {
      throw new Error(`${check.label} took ${Math.round(ms)}ms (limit ${check.maxMs}ms)`)
    }
    console.log(`ok  ${check.label} ${Math.round(ms)}ms`)
  }

  // Large list response should be bounded
  const { res: clubsRes, ms: clubsMs } = await timedFetch(`${base}/api/clubs`)
  const clubs = await clubsRes.json()
  if (!Array.isArray(clubs)) throw new Error('clubs response is not an array')
  if (clubs.length > 500) throw new Error(`clubs list unexpectedly large: ${clubs.length}`)
  console.log(`ok  clubs list size ${clubs.length} (${Math.round(clubsMs)}ms)`)

  console.log('smoke-performance ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
