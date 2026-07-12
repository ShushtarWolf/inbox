#!/usr/bin/env node
/** CI e2e — start built server, run Playwright, shut down. */
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'
const port = new URL(base).port || '3000'

async function waitForHealth(timeoutMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) return
    } catch {
      // server still booting
    }
    await delay(2000)
  }
  throw new Error(`Server did not become healthy at ${base}/api/health within ${timeoutMs}ms`)
}

function startServer() {
  const child = spawn('node', ['.output/server/index.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: port,
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: port,
    },
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))
  return child
}

async function main() {
  const server = startServer()
  let exitCode = 0

  const shutdown = () => {
    if (!server.killed) server.kill('SIGTERM')
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await waitForHealth()
    console.log('[ci-e2e] server healthy')
    const result = spawnSync('npx', ['playwright', 'test'], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: base },
    })
    if (result.status !== 0) throw new Error(`playwright failed with exit ${result.status}`)
    console.log('[ci-e2e] all checks passed')
  } catch (error) {
    exitCode = 1
    console.error('[ci-e2e] failed:', error)
  } finally {
    shutdown()
    await delay(1000)
    if (!server.killed) server.kill('SIGKILL')
  }

  process.exit(exitCode)
}

main()
