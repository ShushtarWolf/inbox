import { describe, expect, it } from 'vitest'
import {
  classifyPaymentDocumentFile,
  PAYMENT_DOCUMENT_ACCEPT,
  PAYMENT_DOCUMENT_MAX_BYTES,
  isAllowedPaymentDocumentType,
  sanitizePaymentDocumentFileName,
} from './paymentDocumentUpload'

describe('classifyPaymentDocumentFile', () => {
  it('accepts jpeg/png/webp/pdf under the size cap', () => {
    expect(classifyPaymentDocumentFile({ type: 'image/jpeg', size: 1024, name: 'a.jpg' })).toBeNull()
    expect(classifyPaymentDocumentFile({ type: 'image/png', size: 1024, name: 'a.png' })).toBeNull()
    expect(classifyPaymentDocumentFile({ type: 'image/webp', size: 1024, name: 'a.webp' })).toBeNull()
    expect(classifyPaymentDocumentFile({ type: 'application/pdf', size: 1024, name: 'a.pdf' })).toBeNull()
  })

  it('rejects HEIC by MIME or extension', () => {
    expect(classifyPaymentDocumentFile({ type: 'image/heic', size: 1024, name: 'a.heic' })).toBe('heic')
    expect(classifyPaymentDocumentFile({ type: '', size: 1024, name: 'photo.HEIC' })).toBe('heic')
  })

  it('rejects unsupported types', () => {
    expect(classifyPaymentDocumentFile({ type: 'image/gif', size: 1024, name: 'a.gif' })).toBe('type')
    expect(classifyPaymentDocumentFile({ type: 'application/msword', size: 1024, name: 'a.doc' })).toBe('type')
  })

  it('rejects oversized files', () => {
    expect(classifyPaymentDocumentFile({
      type: 'application/pdf',
      size: PAYMENT_DOCUMENT_MAX_BYTES + 1,
      name: 'big.pdf',
    })).toBe('size')
  })

  it('allows missing MIME when extension is jpg/png/webp/pdf', () => {
    expect(classifyPaymentDocumentFile({ type: '', size: 10, name: 'a.jpeg' })).toBeNull()
    expect(classifyPaymentDocumentFile({ type: '', size: 10, name: 'a.pdf' })).toBeNull()
  })
})

describe('payment document helpers', () => {
  it('exposes accept string matching allowed types', () => {
    expect(PAYMENT_DOCUMENT_ACCEPT).toContain('application/pdf')
    expect(isAllowedPaymentDocumentType('application/pdf')).toBe(true)
    expect(isAllowedPaymentDocumentType('image/gif')).toBe(false)
  })

  it('sanitizes stored file names', () => {
    expect(sanitizePaymentDocumentFileName('../../etc/passwd')).toBe('.._.._etc_passwd')
    expect(sanitizePaymentDocumentFileName('')).toBe('document')
  })
})
