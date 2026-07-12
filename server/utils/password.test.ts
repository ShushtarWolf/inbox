import { describe, expect, it } from 'vitest'
import { hashSecret, verifySecret } from './password'

describe('hashSecret / verifySecret', () => {
  it('verifies a correct password', () => {
    const stored = hashSecret('demo1234')
    expect(verifySecret('demo1234', stored)).toBe(true)
  })

  it('rejects wrong password', () => {
    const stored = hashSecret('demo1234')
    expect(verifySecret('wrong', stored)).toBe(false)
  })

  it('rejects malformed stored hash', () => {
    expect(verifySecret('demo1234', 'not-a-hash')).toBe(false)
    expect(verifySecret('demo1234', 'scrypt:only')).toBe(false)
  })

  it('uses unique salts per hash', () => {
    const a = hashSecret('same')
    const b = hashSecret('same')
    expect(a).not.toBe(b)
    expect(verifySecret('same', a)).toBe(true)
    expect(verifySecret('same', b)).toBe(true)
  })
})
