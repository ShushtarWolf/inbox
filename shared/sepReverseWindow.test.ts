import { describe, expect, it } from 'vitest'
import {
  canAttemptSepReverse,
  isSepReverseAmbiguousError,
  isSepReverseAlreadyDoneError,
  SEP_REVERSE_WINDOW_MS,
} from './sepReverseWindow.ts'

describe('canAttemptSepReverse', () => {
  const base = {
    method: 'IPG',
    provider: 'sep',
    paymentsMode: 'live',
    metadata: {
      refNum: 'R1',
      confirmedAt: new Date('2026-11-02T12:00:00.000Z').toISOString(),
    },
  }

  it('allows reverse inside 25 minutes', () => {
    const res = canAttemptSepReverse({
      ...base,
      now: new Date(Date.parse(base.metadata.confirmedAt) + SEP_REVERSE_WINDOW_MS - 1000),
    })
    expect(res).toEqual({ ok: true, refNum: 'R1' })
  })

  it('blocks outside window / test mode / missing ref / already reversed', () => {
    expect(canAttemptSepReverse({
      ...base,
      now: new Date(Date.parse(base.metadata.confirmedAt) + SEP_REVERSE_WINDOW_MS + 1),
    }).ok).toBe(false)
    expect(canAttemptSepReverse({ ...base, paymentsMode: 'test' }).ok).toBe(false)
    expect(canAttemptSepReverse({
      ...base,
      metadata: { confirmedAt: base.metadata.confirmedAt },
    }).ok).toBe(false)
    expect(canAttemptSepReverse({
      ...base,
      metadata: { ...base.metadata, gatewayReversed: true },
    })).toEqual({ ok: false, reason: 'already_reversed' })
  })
})

describe('isSepReverseAmbiguousError', () => {
  it('treats timeouts as ambiguous and SEP business codes as definitive', () => {
    expect(isSepReverseAmbiguousError(new Error('fetch failed: timeout'))).toBe(true)
    expect(isSepReverseAmbiguousError(new Error('SEP reverse failed (code=5): not allowed'))).toBe(false)
  })
})

describe('isSepReverseAlreadyDoneError', () => {
  it('matches SEP codes 2 / 5 only, never free text', () => {
    expect(isSepReverseAlreadyDoneError(new Error('SEP reverse failed (code=2): درخواست تکراری'))).toBe(true)
    expect(isSepReverseAlreadyDoneError(new Error('SEP reverse failed (code=5): reversed'))).toBe(true)
    expect(isSepReverseAlreadyDoneError(new Error('SEP reverse failed (code=-6): تراکنش قبلا تسویه شده'))).toBe(false)
    expect(isSepReverseAlreadyDoneError(new Error('Transaction already reversed'))).toBe(false)
  })
})
