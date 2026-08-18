import { describe, expect, it } from 'vitest'
import {
  isPayPin,
  normalizePayPin,
  PAY_PIN_ALPHABET,
  PAY_PIN_LENGTH,
  payPath,
  whatsappHrefForIranMobile,
} from './payPin.ts'

describe('payPin', () => {
  it('normalizes case and strips punctuation', () => {
    expect(normalizePayPin(' Ab12-CD9x ')).toBe('ab12cd9x')
    expect(isPayPin('a2b3c4d5')).toBe(true)
    expect(isPayPin('short')).toBe(false)
    expect(isPayPin('toolong99')).toBe(false)
    expect(PAY_PIN_ALPHABET).not.toMatch(/[01ol]/)
  })

  it('builds a /p path', () => {
    expect(payPath('Ab12Cd9x')).toBe('/p/ab12cd9x')
    expect(normalizePayPin('a'.repeat(PAY_PIN_LENGTH))).toHaveLength(PAY_PIN_LENGTH)
  })

  it('builds a WhatsApp share href for Iranian mobiles', () => {
    const href = whatsappHrefForIranMobile('09121234567', 'https://inboxs.ir/p/ab12cd9x')
    expect(href).toContain('https://wa.me/989121234567?text=')
    expect(href).toContain(encodeURIComponent('https://inboxs.ir/p/ab12cd9x'))
    expect(whatsappHrefForIranMobile('', 'hi')).toBe(`https://wa.me/?text=${encodeURIComponent('hi')}`)
  })
})
