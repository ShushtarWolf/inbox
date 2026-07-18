#!/usr/bin/env node
/**
 * Safe local storage diagnostics — never prints S3 access/secret keys.
 * Usage: npm run storage:status
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))

const S3_ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_PUBLIC_URL',
]

const flags = {
  hasEndpoint: Boolean(process.env.S3_ENDPOINT?.trim()),
  hasBucket: Boolean(process.env.S3_BUCKET?.trim()),
  hasAccessKey: Boolean(process.env.S3_ACCESS_KEY?.trim()),
  hasSecretKey: Boolean(process.env.S3_SECRET_KEY?.trim()),
  hasPublicUrl: Boolean(process.env.S3_PUBLIC_URL?.trim()),
}
const setCount = Object.values(flags).filter(Boolean).length
const s3Configured = setCount === S3_ENV_KEYS.length
const warnings = []
if (setCount > 0 && !s3Configured) {
  const missing = S3_ENV_KEYS.filter((key) => {
    switch (key) {
      case 'S3_ENDPOINT': return !flags.hasEndpoint
      case 'S3_BUCKET': return !flags.hasBucket
      case 'S3_ACCESS_KEY': return !flags.hasAccessKey
      case 'S3_SECRET_KEY': return !flags.hasSecretKey
      case 'S3_PUBLIC_URL': return !flags.hasPublicUrl
      default: return false
    }
  })
  warnings.push(`Partial S3 config — missing ${missing.join(', ')}; using local public/uploads`)
}

let publicUrlHost = null
const publicUrl = process.env.S3_PUBLIC_URL?.trim() || ''
if (publicUrl) {
  try {
    publicUrlHost = new URL(publicUrl).host
  } catch {
    warnings.push('S3_PUBLIC_URL is not a valid URL')
  }
}

console.log(JSON.stringify({
  storageMode: s3Configured ? 's3' : 'local',
  s3Configured,
  ...flags,
  bucket: s3Configured ? (process.env.S3_BUCKET?.trim() || null) : null,
  publicUrlHost,
  maxUploadBytes: 5 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  warnings,
  note: s3Configured
    ? 'S3 configured — uploads use PutObject (forcePathStyle); URLs use S3_PUBLIC_URL'
    : 'S3 unset or incomplete — uploads write to public/uploads (localhost-friendly)',
  verifyAdmin: 'curl -H "x-admin-secret: $ADMIN_PROVISION_SECRET" http://localhost:3000/api/admin/storage-status',
}, null, 2))
