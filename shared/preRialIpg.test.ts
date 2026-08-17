import { describe, expect, it } from 'vitest'
import {
  PRE_RIAL_IPG_CUTOFF,
  correctedTomanFromPreRialAmount,
  isPreRialIpgPayment,
} from './preRialIpg'

const before = new Date('2026-08-16T12:33:31.827Z')
const after = new Date('2026-08-17T14:06:11.913Z')

describe('correctedTomanFromPreRialAmount', () => {
  it('turns the bank rial integer into toman', () => {
    expect(correctedTomanFromPreRialAmount(600_000)).toBe(60_000)
    expect(correctedTomanFromPreRialAmount(50_000)).toBe(5_000)
    expect(correctedTomanFromPreRialAmount(650_000)).toBe(65_000)
  })
})

describe('isPreRialIpgPayment', () => {
  const paidSep = {
    status: 'PAID',
    method: 'IPG',
    provider: 'sep',
    createdAt: before,
    amount: 600_000,
  }

  it('selects paid SEP IPG created before the ×10 cutoff', () => {
    expect(isPreRialIpgPayment(paidSep)).toBe(true)
    expect(before < PRE_RIAL_IPG_CUTOFF).toBe(true)
  })

  it('skips pending, non-sep, and post-cutoff rows', () => {
    expect(isPreRialIpgPayment({ ...paidSep, status: 'PENDING_ONLINE' })).toBe(false)
    expect(isPreRialIpgPayment({ ...paidSep, provider: 'log' })).toBe(false)
    expect(isPreRialIpgPayment({ ...paidSep, createdAt: after })).toBe(false)
  })

  it('skips rows already corrected', () => {
    expect(isPreRialIpgPayment({
      ...paidSep,
      amount: 60_000,
      metadataJson: JSON.stringify({ preRialIpgCorrected: true }),
    })).toBe(false)
  })
})
