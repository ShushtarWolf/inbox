import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  test: {
    include: ['lib/**/*.test.ts', 'runtime/server/lib/bookingGuard.test.ts'],
    environment: 'node',
  },
})
