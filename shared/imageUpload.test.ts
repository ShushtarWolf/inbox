import { describe, expect, it } from 'vitest'
import {
  classifyImageUploadFile,
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_SOURCE_MAX_BYTES,
  inferImageUploadContentType,
  isAllowedImageUploadType,
  isHeicFtypHeader,
  isHeicLikeFile,
} from './imageUpload'

describe('classifyImageUploadFile', () => {
  it('accepts jpeg/png/webp under the source cap', () => {
    expect(classifyImageUploadFile({ type: 'image/jpeg', size: 1024, name: 'a.jpg' })).toBeNull()
    expect(classifyImageUploadFile({ type: 'image/png', size: 1024, name: 'a.png' })).toBeNull()
    expect(classifyImageUploadFile({ type: 'image/webp', size: 1024, name: 'a.webp' })).toBeNull()
  })

  it('allows HEIC/HEIF in the picker (converted before POST)', () => {
    expect(classifyImageUploadFile({ type: 'image/heic', size: 1024, name: 'a.heic' })).toBeNull()
    expect(classifyImageUploadFile({ type: '', size: 1024, name: 'photo.HEIC' })).toBeNull()
    expect(classifyImageUploadFile({ type: 'image/heif', size: 2048, name: 'a.heif' })).toBeNull()
    expect(isHeicLikeFile({ type: 'image/heic', name: 'a.heic' })).toBe(true)
  })

  it('rejects unsupported types', () => {
    expect(classifyImageUploadFile({ type: 'image/gif', size: 1024, name: 'a.gif' })).toBe('type')
    expect(classifyImageUploadFile({ type: 'image/jpg', size: 1024, name: 'a.jpg' })).toBe('type')
    expect(classifyImageUploadFile({ type: 'application/pdf', size: 1024, name: 'a.pdf' })).toBe('type')
  })

  it('rejects source files over ~25 MB, not the 5 MB server cap', () => {
    expect(classifyImageUploadFile({
      type: 'image/jpeg',
      size: IMAGE_UPLOAD_MAX_BYTES + 1,
      name: 'big.jpg',
    })).toBeNull()
    expect(classifyImageUploadFile({
      type: 'image/heic',
      size: IMAGE_UPLOAD_SOURCE_MAX_BYTES + 1,
      name: 'huge.heic',
    })).toBe('size')
  })

  it('allows missing MIME when extension is jpg/png/webp/heic', () => {
    expect(classifyImageUploadFile({ type: '', size: 10, name: 'a.jpeg' })).toBeNull()
    expect(classifyImageUploadFile({ type: '', size: 10, name: 'a.png' })).toBeNull()
    expect(classifyImageUploadFile({ type: '', size: 10, name: 'a.heif' })).toBeNull()
  })
})

describe('image upload constants', () => {
  it('exposes accept string with HEIC/HEIF picker types', () => {
    expect(IMAGE_UPLOAD_ACCEPT).toContain('image/jpeg')
    expect(IMAGE_UPLOAD_ACCEPT).toContain('image/png')
    expect(IMAGE_UPLOAD_ACCEPT).toContain('image/webp')
    expect(IMAGE_UPLOAD_ACCEPT).toContain('image/heic')
    expect(IMAGE_UPLOAD_ACCEPT).toContain('image/heif')
    expect(IMAGE_UPLOAD_ACCEPT).toContain('.heic')
    expect(isAllowedImageUploadType('image/jpeg')).toBe(true)
    expect(isAllowedImageUploadType('image/webp')).toBe(true)
    expect(isAllowedImageUploadType('image/heic')).toBe(false)
    expect(isAllowedImageUploadType('image/gif')).toBe(false)
  })
})

describe('isHeicFtypHeader', () => {
  it('detects HEIC ftyp major brand', () => {
    const bytes = new Uint8Array(12)
    bytes.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
    expect(isHeicFtypHeader(bytes)).toBe(true)
  })

  it('ignores non-HEIC ftyp', () => {
    const bytes = new Uint8Array(12)
    bytes.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x6a, 0x70, 0x65, 0x67])
    expect(isHeicFtypHeader(bytes)).toBe(false)
  })
})

describe('inferImageUploadContentType', () => {
  it('uses explicit allowed MIME when present', () => {
    expect(inferImageUploadContentType({ type: 'image/webp', filename: 'photo.webp' })).toBe('image/webp')
  })

  it('infers from prepared filenames when multipart type is missing', () => {
    expect(inferImageUploadContentType({ type: '', filename: 'photo.webp' })).toBe('image/webp')
    expect(inferImageUploadContentType({ type: '', filename: 'photo.jpg' })).toBe('image/jpeg')
  })
})
