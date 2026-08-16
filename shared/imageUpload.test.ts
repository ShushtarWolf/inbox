import { describe, expect, it } from 'vitest'
import {
  classifyImageUploadFile,
  IMAGE_UPLOAD_ACCEPT,
  IMAGE_UPLOAD_MAX_BYTES,
  isAllowedImageUploadType,
} from './imageUpload'

describe('classifyImageUploadFile', () => {
  it('accepts jpeg/png/webp under the size cap', () => {
    expect(classifyImageUploadFile({ type: 'image/jpeg', size: 1024, name: 'a.jpg' })).toBeNull()
    expect(classifyImageUploadFile({ type: 'image/png', size: 1024, name: 'a.png' })).toBeNull()
    expect(classifyImageUploadFile({ type: 'image/webp', size: 1024, name: 'a.webp' })).toBeNull()
  })

  it('rejects HEIC by MIME or extension', () => {
    expect(classifyImageUploadFile({ type: 'image/heic', size: 1024, name: 'a.heic' })).toBe('heic')
    expect(classifyImageUploadFile({ type: '', size: 1024, name: 'photo.HEIC' })).toBe('heic')
  })

  it('rejects unsupported types', () => {
    expect(classifyImageUploadFile({ type: 'image/gif', size: 1024, name: 'a.gif' })).toBe('type')
    expect(classifyImageUploadFile({ type: 'image/jpg', size: 1024, name: 'a.jpg' })).toBe('type')
    expect(classifyImageUploadFile({ type: 'application/pdf', size: 1024, name: 'a.pdf' })).toBe('type')
  })

  it('rejects oversized files', () => {
    expect(classifyImageUploadFile({
      type: 'image/jpeg',
      size: IMAGE_UPLOAD_MAX_BYTES + 1,
      name: 'big.jpg',
    })).toBe('size')
  })

  it('allows missing MIME when extension is jpg/png/webp', () => {
    expect(classifyImageUploadFile({ type: '', size: 10, name: 'a.jpeg' })).toBeNull()
    expect(classifyImageUploadFile({ type: '', size: 10, name: 'a.png' })).toBeNull()
  })
})

describe('image upload constants', () => {
  it('exposes accept string matching allowed types', () => {
    expect(IMAGE_UPLOAD_ACCEPT).toBe('image/jpeg,image/png,image/webp')
    expect(isAllowedImageUploadType('image/jpeg')).toBe(true)
    expect(isAllowedImageUploadType('image/gif')).toBe(false)
  })
})
