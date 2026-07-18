import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageStatus, isAclUnsupportedError, validateImageUpload } from '../server/utils/storage'

vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => {
  const err = new Error(input.statusMessage) as Error & { statusCode: number }
  err.statusCode = input.statusCode
  throw err
})

describe('validateImageUpload', () => {
  it('accepts allowed image types under size limit', () => {
    expect(() => validateImageUpload('image/jpeg', 1024)).not.toThrow()
    expect(() => validateImageUpload('image/png', 1024)).not.toThrow()
    expect(() => validateImageUpload('image/webp', 1024)).not.toThrow()
  })

  it('rejects unsupported types', () => {
    expect(() => validateImageUpload('image/gif', 1024)).toThrow(/JPEG, PNG, and WebP/)
  })

  it('rejects oversized files', () => {
    expect(() => validateImageUpload('image/jpeg', 6 * 1024 * 1024)).toThrow(/5 MB/)
  })

  it('allows zero-byte uploads (size check only caps max)', () => {
    expect(() => validateImageUpload('image/jpeg', 0)).not.toThrow()
  })
})

describe('isAclUnsupportedError', () => {
  it('detects AccessControlListNotSupported', () => {
    expect(isAclUnsupportedError({ name: 'AccessControlListNotSupported', message: 'ACL' })).toBe(true)
  })

  it('detects message-based ACL rejection', () => {
    expect(isAclUnsupportedError({ message: 'The bucket does not allow ACLs' })).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isAclUnsupportedError({ name: 'NoSuchBucket', message: 'missing' })).toBe(false)
    expect(isAclUnsupportedError(null)).toBe(false)
  })
})

describe('getStorageStatus', () => {
  const keys = [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_PUBLIC_URL',
  ]

  afterEach(() => {
    for (const key of keys) delete process.env[key]
  })

  it('reports local when S3 vars are unset', () => {
    for (const key of keys) delete process.env[key]
    const status = getStorageStatus()
    expect(status.storageMode).toBe('local')
    expect(status.s3Configured).toBe(false)
    expect(status.hasAccessKey).toBe(false)
    expect(status.hasSecretKey).toBe(false)
    expect(status).not.toHaveProperty('accessKey')
    expect(status).not.toHaveProperty('secretKey')
    expect(status).not.toHaveProperty('S3_SECRET_KEY')
  })

  it('reports s3 when all S3 vars are set (no secrets in snapshot)', () => {
    process.env.S3_ENDPOINT = 'https://storage.iran.liara.space'
    process.env.S3_BUCKET = 'inbox-uploads'
    process.env.S3_ACCESS_KEY = 'test-access-key'
    process.env.S3_SECRET_KEY = 'test-secret-key-value'
    process.env.S3_PUBLIC_URL = 'https://inbox-uploads.storage.iran.liara.space'
    const status = getStorageStatus()
    expect(status.storageMode).toBe('s3')
    expect(status.s3Configured).toBe(true)
    expect(status.bucket).toBe('inbox-uploads')
    expect(status.publicUrlHost).toBe('inbox-uploads.storage.iran.liara.space')
    const raw = JSON.stringify(status)
    expect(raw).not.toContain('test-access-key')
    expect(raw).not.toContain('test-secret-key-value')
  })

  it('warns on partial S3 config and stays local', () => {
    process.env.S3_ENDPOINT = 'https://storage.iran.liara.space'
    process.env.S3_BUCKET = 'inbox-uploads'
    const status = getStorageStatus()
    expect(status.storageMode).toBe('local')
    expect(status.warnings.some((w) => w.includes('Partial S3'))).toBe(true)
  })

  it('warns in production when S3 is unset (ephemeral local disk)', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    for (const key of keys) delete process.env[key]
    try {
      const status = getStorageStatus()
      expect(status.storageMode).toBe('local')
      expect(status.warnings.some((w) => w.includes('ephemeral'))).toBe(true)
    } finally {
      process.env.NODE_ENV = previous
    }
  })
})
