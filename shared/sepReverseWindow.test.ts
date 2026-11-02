import { describe, expect, it } from 'vitest'
import { canAttemptSepReverse, SEP_REVERSE_WINDOW_MS } from './sepReverseWindow.ts'

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

  it('blocks outside window / test mode / missing ref', () => {
    expect(canAttemptSepReverse({
      ...base,
      now: new Date(Date.parse(base.metadata.confirmedAt) + SEP_REVERSE_WINDOW_MS + 1),
    }).ok).toBe(false)
    expect(canAttemptSepReverse({ ...base, paymentsMode: 'test' }).ok).toBe(false)
    expect(canAttemptSepReverse({
      ...base,
      metadata: { confirmedAt: base.metadata.confirmedAt },
    }).ok).toBe(false)
  })
})
