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

export function validateImageUpload(contentType: string, size: number) {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG, and WebP images are allowed' })
  }
  if (size > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Image must be 5 MB or smaller' })
  }
}

function s3Config() {
  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  const accessKey = process.env.S3_ACCESS_KEY
  const secretKey = process.env.S3_SECRET_KEY
  const publicUrl = process.env.S3_PUBLIC_URL
  if (!endpoint || !bucket || !accessKey || !secretKey || !publicUrl) return null
  return { endpoint, bucket, accessKey, secretKey, publicUrl }
}

function createS3Client() {
  const config = s3Config()
  if (!config) return null
  return {
    client: new S3Client({
      region: 'auto',
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

export async function uploadImage(buffer: Buffer, options: { folder: string; contentType: string }) {
  validateImageUpload(options.contentType, buffer.length)
  const ext = EXT_BY_TYPE[options.contentType] || 'bin'
  const key = `${options.folder}/${randomUUID()}.${ext}`
  const s3 = createS3Client()

  if (s3) {
    await s3.client.send(new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType,
      ACL: 'public-read',
    }))
    return `${s3.publicUrl}/${key}`
  }

  const localDir = join(process.cwd(), 'public', 'uploads', options.folder)
  await mkdir(localDir, { recursive: true })
  const filename = `${randomUUID()}.${ext}`
  await writeFile(join(localDir, filename), buffer)
  return `/uploads/${options.folder}/${filename}`
}
