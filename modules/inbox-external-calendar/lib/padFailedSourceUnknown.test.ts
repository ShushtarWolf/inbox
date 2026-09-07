import { describe, expect, it } from 'vitest'
import { reconcileConfirmedBusy, reconcileSourceVerdicts } from './reconcile'
import {
  isFailedOrWipedEmpty,
  unknownVerdictsForCourtHours,
  verdictsForReconcile,
} from './padFailedSourceUnknown'
import { displayBlocksExternal } from './observation'

const courts = [
  { id: 'c1', effectiveOpenHour: 10, effectiveCloseHour: 12 },
]

const alovarzeshBusy = {
  supported: true as const,
  source: 'alovarzesh',
  health: 'HEALTHY' as const,
  completeness: 'COMPLETE' as const,
  slotVerdicts: [
    {
      courtKey: 'c1',
      startTime: '10:00',
      endTime: '11:00',
      verdict: 'BUSY' as const,
      source: 'alovarzesh',
    },
  ],
}

describe('padFailedSourceUnknown', () => {
  it('pads UNKNOWN hours for a supported wipe', () => {
    const rows = unknownVerdictsForCourtHours(courts, 'aloplay', 60)
    expect(rows).toEqual([
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'UNKNOWN', source: 'aloplay' },
      { courtKey: 'c1', startTime: '11:00', endTime: '12:00', verdict: 'UNKNOWN', source: 'aloplay' },
    ])
  })

  it('1. supported + failed/wiped + empty → UNKNOWN pad (BUSY + UNKNOWN → Available)', () => {
    const wiped = {
      supported: true,
      source: 'aloplay',
      health: 'OFFLINE' as const,
      completeness: 'UNKNOWN' as const,
      error: 'AloPlay credentials missing',
      anomalies: ['no_auth'],
      slotVerdicts: [] as [],
      occupied: [] as [],
    }
    expect(isFailedOrWipedEmpty(wiped)).toBe(true)

    const verdicts = verdictsForReconcile({
      adapters: [wiped, alovarzeshBusy],
      courts,
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toEqual([])
    expect(reconcileSourceVerdicts({ aloplay: 'UNKNOWN', alovarzesh: 'BUSY' })).toBe('UNKNOWN')
    expect(displayBlocksExternal('UNKNOWN')).toBe(false)
  })

  it('2. supported + successful/valid empty → no pad (lone BUSY may still EXTERNAL_BUSY)', () => {
    const successfulEmpty = {
      supported: true,
      source: 'aloplay',
      health: 'HEALTHY' as const,
      completeness: 'COMPLETE' as const,
      slotVerdicts: [] as [],
      occupied: [] as [],
    }
    expect(isFailedOrWipedEmpty(successfulEmpty)).toBe(false)

    const verdicts = verdictsForReconcile({
      adapters: [successfulEmpty, alovarzeshBusy],
      courts,
      sessionDurationMinutes: 60,
    })
    const confirmed = reconcileConfirmedBusy(verdicts, 60)
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]?.state).toBe('EXTERNAL_BUSY')
    expect(confirmed[0]?.source).toBe('alovarzesh')
  })

  it('rate_limited DEGRADED empty also pads', () => {
    expect(
      isFailedOrWipedEmpty({
        supported: true,
        source: 'aloplay',
        health: 'DEGRADED',
        completeness: 'UNKNOWN',
        anomalies: ['rate_limited'],
        slotVerdicts: [],
      }),
    ).toBe(true)
  })

  it('unsupported silence + AloVarzesh BUSY → EXTERNAL_BUSY', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: false,
          source: 'aloplay',
          slotVerdicts: [],
          occupied: [],
        },
        alovarzeshBusy,
      ],
      courts,
      sessionDurationMinutes: 60,
    })
    const confirmed = reconcileConfirmedBusy(verdicts, 60)
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]?.state).toBe('EXTERNAL_BUSY')
  })

  it('both sources BUSY with real verdicts → EXTERNAL_BUSY unchanged', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [
            { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY', source: 'aloplay' },
          ],
        },
        alovarzeshBusy,
      ],
      courts,
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toHaveLength(1)
  })
})
