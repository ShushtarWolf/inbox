#!/usr/bin/env node
/**
 * Guardrail: stale-tab chunk failures must reload, not sit on error.vue as "500".
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')

if (!/emitRouteChunkError:\s*['"]automatic-immediate['"]/.test(src)) {
  console.error('nuxt.config.ts must set experimental.emitRouteChunkError to "automatic-immediate"')
  process.exit(1)
}

if (!readFileSync(new URL('../shared/chunkLoadError.ts', import.meta.url), 'utf8').includes('isStaleChunkLoadError')) {
  console.error('shared/chunkLoadError.ts missing isStaleChunkLoadError')
  process.exit(1)
}

console.log('check-chunk-reload: OK')