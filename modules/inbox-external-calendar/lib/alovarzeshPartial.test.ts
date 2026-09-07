import { describe, expect, it } from 'vitest'
import { displayBlocksExternal } from './observation'
import { reconcileConfirmedBusy, reconcileSourceVerdicts } from './reconcile'
import { isFailedOrWipedEmpty, verdictsForReconcile } from './padFailedSourceUnknown'

/**
 * Documents AloVarzesh PARTIAL adapter output after failed-court UNKNOWN emit
 * (mirrors catch branch in adapters/alovarzesh.ts — same shape as null productId).
 */
function alovarzeshPartialVerdicts(opts: {
  successCourtId: string
  failedCourtId: string
  successHour: string
  successVerdict: 'FREE' | 'BUSY' | 'UNKNOWN'
  failedHours: string[]
}) {
  return [
    {
      courtKey: opts.successCourtId,
      startTime: opts.successHour,
      endTime: '11:00',
      verdict: opts.successVerdict,
      source: 'alovarzesh' as const,
    },
    ...opts.failedHours.map((startTime) => ({
      courtKey: opts.failedCourtId,
      startTime,
      endTime: `${String(Number.parseInt(startTime, 10) + 1).padStart(2, '0')}:00`,
      verdict: 'UNKNOWN' as const,
      source: 'alovarzesh' as const,
    })),
  ]
}

describe('AloVarzesh PARTIAL failed-court UNKNOWN', () => {
  const failedHours = ['10:00', '11:00']

  it('1. PARTIAL + failed Court → UNKNOWN for every hour of that Court', () => {
    const rows = alovarzeshPartialVerdicts({
      successCourtId: 'courtA',
      failedCourtId: 'courtB',
      successHour: '10:00',
      successVerdict: 'FREE',
      failedHours,
    })
    const forB = rows.filter((r) => r.courtKey === 'courtB')
    expect(forB).toHaveLength(2)
    expect(forB.every((r) => r.verdict === 'UNKNOWN')).toBe(true)
  })

  it('2. failed Court UNKNOWN + AloPlay BUSY → EXTERNAL_BUSY', () => {
    const av = alovarzeshPartialVerdicts({
      successCourtId: 'courtA',
      failedCourtId: 'courtB',
      successHour: '10:00',
      successVerdict: 'FREE',
      failedHours,
    })
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [
            {
              courtKey: 'courtB',
              startTime: '10:00',
              endTime: '11:00',
              verdict: 'BUSY',
              source: 'aloplay',
            },
          ],
        },
        {
          supported: true,
          source: 'alovarzesh',
          health: 'DEGRADED',
          completeness: 'PARTIAL',
          anomalies: ['partial_court_fetch'],
          slotVerdicts: av,
        },
      ],
      courts: [
        { id: 'courtA', effectiveOpenHour: 10, effectiveCloseHour: 12 },
        { id: 'courtB', effectiveOpenHour: 10, effectiveCloseHour: 12 },
      ],
      sessionDurationMinutes: 60,
    })

    const confirmed = reconcileConfirmedBusy(verdicts, 60)
    expect(confirmed.filter((r) => r.courtKey === 'courtB')).toHaveLength(1)
    expect(confirmed.find((r) => r.courtKey === 'courtB')?.state).toBe('EXTERNAL_BUSY')
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'UNKNOWN' })).toBe('EXTERNAL_BUSY')
    expect(displayBlocksExternal('EXTERNAL_BUSY')).toBe(true)
  })

  it('3. successful Courts keep their real verdicts', () => {
    const av = alovarzeshPartialVerdicts({
      successCourtId: 'courtA',
      failedCourtId: 'courtB',
      successHour: '10:00',
      successVerdict: 'FREE',
      failedHours,
    })
    expect(av.find((r) => r.courtKey === 'courtA' && r.startTime === '10:00')?.verdict).toBe('FREE')
  })

  it('4. successful FREE + failed Court → failure is UNKNOWN, not FREE/BUSY', () => {
    const av = alovarzeshPartialVerdicts({
      successCourtId: 'courtA',
      failedCourtId: 'courtB',
      successHour: '10:00',
      successVerdict: 'FREE',
      failedHours,
    })
    const failed = av.filter((r) => r.courtKey === 'courtB')
    expect(failed.every((r) => r.verdict === 'UNKNOWN')).toBe(true)
    expect(failed.some((r) => r.verdict === 'FREE' || r.verdict === 'BUSY')).toBe(false)
  })

  it('5. total-fail empty still pads UNKNOWN; other BUSY → EXTERNAL_BUSY', () => {
    expect(
      isFailedOrWipedEmpty({
        supported: true,
        source: 'alovarzesh',
        health: 'OFFLINE',
        completeness: 'UNKNOWN',
        anomalies: ['fetch_failed'],
        slotVerdicts: [],
      }),
    ).toBe(true)

    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'alovarzesh',
          health: 'OFFLINE',
          completeness: 'UNKNOWN',
          anomalies: ['fetch_failed'],
          slotVerdicts: [],
        },
        {
          supported: true,
          source: 'aloplay',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [
            {
              courtKey: 'courtB',
              startTime: '10:00',
              endTime: '11:00',
              verdict: 'BUSY',
              source: 'aloplay',
            },
          ],
        },
      ],
      courts: [{ id: 'courtB', effectiveOpenHour: 10, effectiveCloseHour: 11 }],
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toHaveLength(1)
    expect(reconcileConfirmedBusy(verdicts, 60)[0]?.state).toBe('EXTERNAL_BUSY')
  })

  it('invariants: any BUSY blocks including BUSY+FREE', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'BUSY' })).toBe('EXTERNAL_BUSY')
    expect(displayBlocksExternal('EXTERNAL_BUSY')).toBe(true)
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'FREE' })).toBe('EXTERNAL_BUSY')
    expect(displayBlocksExternal(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'FREE' }))).toBe(true)
  })
})
