#!/usr/bin/env node
/**
 * Stable local Nuxt runner.
 *
 * Why this exists:
 * - Agent/Cursor background shells often get cleaned up, which kills `npm run dev`
 *   and leaves the browser with ERR_CONNECTION_REFUSED.
 * - On this macOS host, native FSEvents watchers can hit EMFILE and crash Nuxt.
 *
 * This script:
 * - Detaches from the parent shell (survives terminal/agent cleanup)
 * - Restarts Nuxt automatically on crash
 * - Uses polling watchers to avoid EMFILE
 * - Writes PID + logs under .inbox-dev/
 *
 * Usage:
 *   node scripts/dev-stable.mjs          # start (or no-op if already healthy)
 *   node scripts/dev-stable.mjs --restart
 *   node scripts/dev-stable.mjs --status
 *   node scripts/dev-stable.mjs --stop
 */
import { spawn, execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  appendFileSync,
  openSync,
  closeSync,
} from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stateDir = resolve(root, '.inbox-dev')
const pidFile = resolve(stateDir, 'dev.pid')
const logFile = resolve(stateDir, 'dev.log')
const supervisorPidFile = resolve(stateDir, 'supervisor.pid')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'

const args = new Set(process.argv.slice(2))

function ensureStateDir() {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true })
}

function readPid(file) {
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf8').trim()
  const pid = Number(raw)
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

function isAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function canConnect(timeoutMs = 1200) {
  return new Promise((resolveOk) => {
    const socket = net.connect({ host, port }, () => {
      socket.end()
      resolveOk(true)
    })
    socket.on('error', () => resolveOk(false))
    socket.setTimeout(timeoutMs, () => {
      socket.destroy()
      resolveOk(false)
    })
  })
}

function sleepSync(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    /* busy-wait — only used briefly during stop */
  }
}

function killTree(pid) {
  if (!isAlive(pid)) return
  try {
    // Kill process group if we started one with detached:true
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* ignore */
    }
  }
  const start = Date.now()
  while (Date.now() - start < 4000 && isAlive(pid)) sleepSync(100)
  if (isAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* ignore */
      }
    }
  }
}

function stopAll() {
  const supervisor = readPid(supervisorPidFile)
  const child = readPid(pidFile)
  if (supervisor) killTree(supervisor)
  if (child) killTree(child)
  // Also clear anything still bound to the port
  try {
    const out = execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    }).trim()
    for (const line of out.split('\n')) {
      const p = Number(line.trim())
      if (p) killTree(p)
    }
  } catch {
    /* nothing listening */
  }
  for (const f of [pidFile, supervisorPidFile]) {
    if (existsSync(f)) unlinkSync(f)
  }
  console.log(`[dev-stable] stopped (port ${port})`)
}

async function status() {
  const supervisor = readPid(supervisorPidFile)
  const child = readPid(pidFile)
  const listening = await canConnect()
  console.log(`[dev-stable] supervisor: ${supervisor && isAlive(supervisor) ? `up (${supervisor})` : 'down'}`)
  console.log(`[dev-stable] nuxt child: ${child && isAlive(child) ? `up (${child})` : 'down'}`)
  console.log(`[dev-stable] http://${host}:${port}/: ${listening ? 'reachable' : 'refused'}`)
  console.log(`[dev-stable] log: ${logFile}`)
  return listening
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  appendFileSync(logFile, line)
}

function runSupervisor() {
  ensureStateDir()
  writeFileSync(supervisorPidFile, String(process.pid))
  logLine(`supervisor start pid=${process.pid} -> http://${host}:${port}/`)
  const logFd = openSync(logFile, 'a')

  let restartCount = 0
  let stopping = false

  const shutdown = () => {
    stopping = true
    const child = readPid(pidFile)
    if (child) killTree(child)
    if (existsSync(supervisorPidFile)) unlinkSync(supervisorPidFile)
    if (existsSync(pidFile)) unlinkSync(pidFile)
    try {
      closeSync(logFd)
    } catch {
      /* ignore */
    }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  const spawnNuxtOnce = () => {
    const env = {
      ...process.env,
      TMPDIR: '/tmp',
      NUXT_IGNORE_LOCK: '1',
      HOST: host,
      PORT: String(port),
      RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || '100',
      CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING || '1',
      CHOKIDAR_INTERVAL: process.env.CHOKIDAR_INTERVAL || '1000',
      WATCHPACK_POLLING: process.env.WATCHPACK_POLLING || 'true',
    }

    const child = spawn(
      process.execPath,
      [resolve(root, 'node_modules/nuxt/bin/nuxt.mjs'), 'dev', '--port', String(port), '--host', host],
      {
        cwd: root,
        env,
        detached: true,
        stdio: ['ignore', logFd, logFd],
      },
    )
    writeFileSync(pidFile, String(child.pid))
    child.unref()
    return child.pid
  }

  const loop = () => {
    if (stopping) return
    restartCount += 1
    logLine(`starting nuxt (attempt ${restartCount})`)
    const pid = spawnNuxtOnce()
    logLine(`nuxt pid=${pid}`)

    const watch = setInterval(() => {
      if (stopping) {
        clearInterval(watch)
        return
      }
      if (!isAlive(pid)) {
        clearInterval(watch)
        logLine(`nuxt pid=${pid} exited — restarting in 1.5s`)
        setTimeout(loop, 1500)
      }
    }, 2000)
  }

  loop()
}

async function start({ force = false } = {}) {
  ensureStateDir()
  if (!force) {
    const listening = await canConnect()
    const supervisor = readPid(supervisorPidFile)
    if (listening && supervisor && isAlive(supervisor)) {
      console.log(`[dev-stable] already running at http://${host}:${port}/`)
      return
    }
  }

  stopAll()
  // Give the port a moment to free
  await new Promise((r) => setTimeout(r, 400))

  // Detach supervisor from this CLI invocation
  const out = openSync(logFile, 'a')
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--supervise'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  })
  child.unref()
  closeSync(out)

  // Wait until port accepts connections
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await canConnect()) {
      console.log(`[dev-stable] ready at http://${host}:${port}/`)
      console.log(`[dev-stable] log: ${logFile}`)
      console.log(`[dev-stable] stop with: npm run dev:stop`)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.error(`[dev-stable] timed out waiting for http://${host}:${port}/ — see ${logFile}`)
  process.exit(1)
}

if (args.has('--supervise')) {
  runSupervisor()
} else if (args.has('--stop')) {
  stopAll()
} else if (args.has('--status')) {
  await status()
} else if (args.has('--restart')) {
  await start({ force: true })
} else {
  await start({ force: false })
}
