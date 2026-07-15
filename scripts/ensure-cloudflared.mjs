#!/usr/bin/env node
/**
 * Download cloudflared into .bin/ when CLOUDFLARE_TUNNEL_TOKEN is set.
 * Used by start-production so Liara can expose the app via Cloudflare Tunnel
 * (works outside Iran and with VPN).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const binDir = join(root, '.bin')
const binary = join(binDir, 'cloudflared')

const ARCH = process.arch === 'arm64' ? 'arm64' : 'amd64'
const URL = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}`

export function cloudflaredPath() {
  return binary
}

export async function ensureCloudflared() {
  if (existsSync(binary)) {
    const check = spawnSync(binary, ['--version'], { encoding: 'utf8' })
    if (check.status === 0) return binary
  }

  mkdirSync(binDir, { recursive: true })
  console.log(`[cloudflared] Downloading ${URL}`)

  const res = await fetch(URL, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Failed to download cloudflared: HTTP ${res.status}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  const tmp = `${binary}.tmp`
  writeFileSync(tmp, buf)
  chmodSync(tmp, 0o755)
  renameSync(tmp, binary)

  const verify = spawnSync(binary, ['--version'], { encoding: 'utf8' })
  if (verify.status !== 0) {
    throw new Error(`cloudflared failed to run: ${verify.stderr || verify.stdout}`)
  }
  console.log(`[cloudflared] Ready: ${(verify.stdout || '').trim()}`)
  return binary
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  ensureCloudflared().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
