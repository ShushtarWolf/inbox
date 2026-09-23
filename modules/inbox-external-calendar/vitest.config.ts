import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root,
  resolve: {
    alias: {
      // Match nuxt.config / root vitest so adapters that import #shared resolve.
      '#shared': `${repoRoot}/shared`,
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'runtime/server/lib/bookingGuard.test.ts'],
    environment: 'node',
  },
})
