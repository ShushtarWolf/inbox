import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Real-Postgres money integration tests. Run: MONEY_IT_DATABASE_URL=... npm run test:money */
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['server/**/*.it.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
