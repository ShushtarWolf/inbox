import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const S3_ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_PUBLIC_URL',
] as const

export function validateImageUpload(contentType: string, size: number) {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG, and WebP images are allowed' })
  }
  if (size > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 5 MB or smaller' })
  }
}

function readS3Env() {
  return {
    endpoint: process.env.S3_ENDPOINT?.trim() || '',
    bucket: process.env.S3_BUCKET?.trim() || '',
    accessKey: process.env.S3_ACCESS_KEY?.trim() || '',
    secretKey: process.env.S3_SECRET_KEY?.trim() || '',
    publicUrl: process.env.S3_PUBLIC_URL?.trim() || '',
  }
}

function s3Config() {
  const env = readS3Env()
  if (!env.endpoint || !env.bucket || !env.accessKey || !env.secretKey || !env.publicUrl) return null
  return env
}

/** True when every required S3_* var is set (uploads go to object storage). */
export function isS3Configured() {
  return s3Config() !== null
}

/**
 * Safe ops snapshot — never includes access/secret keys or full credential values.
 * `storageMode` is `s3` only when all five S3_* vars are present; otherwise `local`.
 */
export function getStorageStatus() {
  const env = readS3Env()
  const flags = {
    hasEndpoint: Boolean(env.endpoint),
    hasBucket: Boolean(env.bucket),
    hasAccessKey: Boolean(env.accessKey),
    hasSecretKey: Boolean(env.secretKey),
    hasPublicUrl: Boolean(env.publicUrl),
  }
  const setCount = Object.values(flags).filter(Boolean).length
  const s3Ready = setCount === S3_ENV_KEYS.length
  const warnings: string[] = []
  if (setCount > 0 && !s3Ready) {
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

  let publicUrlHost: string | null = null
  if (env.publicUrl) {
    try {
      publicUrlHost = new URL(env.publicUrl).host
    } catch {
      warnings.push('S3_PUBLIC_URL is not a valid URL')
    }
  }

  // Liara (and similar) app disks are ephemeral — prod must use object storage.
  if (!s3Ready && process.env.NODE_ENV === 'production') {
    warnings.push(
      'Production local uploads are ephemeral — set all five S3_* vars (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL)',
    )
  }

  return {
    storageMode: s3Ready ? 's3' as const : 'local' as const,
    s3Configured: s3Ready,
    ...flags,
    bucket: s3Ready ? env.bucket : null,
    publicUrlHost,
    maxUploadBytes: MAX_BYTES,
    allowedTypes: [...ALLOWED_TYPES],
    warnings,
    note: s3Ready
      ? 'S3 configured — uploads use PutObject (forcePathStyle); URLs use S3_PUBLIC_URL'
      : 'S3 unset or incomplete — uploads write to public/uploads (localhost-friendly)',
  }
}

function createS3Client() {
  const config = s3Config()
  if (!config) return null
  return {
    client: new S3Client({
      // Liara and most S3-compatible providers accept a fixed region string.
      region: process.env.S3_REGION?.trim() || 'us-east-1',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    }),
    bucket: config.bucket,
    publicUrl: config.publicUrl.replace(/\/$/, ''),
  }
}

/** Detect providers that reject canned ACLs (common on S3-compatible / Object Ownership). */
export function isAclUnsupportedError(err: unknown): boolean {
  const e = err as {
    name?: string
    Code?: string
    code?: string
    message?: string
  } | null
  if (!e) return false
  const code = `${e.name || ''} ${e.Code || ''} ${e.code || ''}`.toLowerCase()
  const msg = (e.message || '').toLowerCase()
  if (code.includes('accesscontrollistnotsupported')) return true
  if (code.includes('notimplemented') && msg.includes('acl')) return true
  if (msg.includes('acl') && (
    msg.includes('not supported')
    || msg.includes('not implemented')
    || msg.includes('does not allow')
    || msg.includes('access control list')
  )) {
    return true
  }
  return false
}

async function putObjectWithAclFallback(
  client: S3Client,
  params: { bucket: string; key: string; body: Buffer; contentType: string },
) {
  const base = {
    Bucket: params.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  }
  // Prefer public-read when the provider supports it; Liara may reject ACL — retry without.
  try {
    await client.send(new PutObjectCommand({ ...base, ACL: 'public-read' }))
  } catch (err) {
    if (!isAclUnsupportedError(err)) throw err
    await client.send(new PutObjectCommand(base))
  }
}

export async function uploadImage(buffer: Buffer, options: { folder: string; contentType: string }) {
  validateImageUpload(options.contentType, buffer.length)
  const ext = EXT_BY_TYPE[options.contentType] || 'bin'
  const key = `${options.folder}/${randomUUID()}.${ext}`
  const s3 = createS3Client()

  if (s3) {
    await putObjectWithAclFallback(s3.client, {
      bucket: s3.bucket,
      key,
      body: buffer,
      contentType: options.contentType,
    })
    return `${s3.publicUrl}/${key}`
  }

  const localDir = join(process.cwd(), 'public', 'uploads', options.folder)
  await mkdir(localDir, { recursive: true })
  const filename = `${randomUUID()}.${ext}`
  await writeFile(join(localDir, filename), buffer)
  return `/uploads/${options.folder}/${filename}`
}
