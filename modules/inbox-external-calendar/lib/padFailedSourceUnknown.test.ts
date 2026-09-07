import { describe, expect, it } from 'vitest'
import { reconcileConfirmedBusy, reconcileSourceVerdicts } from './reconcile'
import {
  unknownVerdictsForCourtHours,
  verdictsForReconcile,
} from './padFailedSourceUnknown'
import { displayBlocksExternal } from './observation'

const courts = [
  { id: 'c1', effectiveOpenHour: 10, effectiveCloseHour: 12 },
]

describe('padFailedSourceUnknown', () => {
  it('pads UNKNOWN hours for a supported wipe', () => {
    const rows = unknownVerdictsForCourtHours(courts, 'aloplay', 60)
    expect(rows).toEqual([
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'UNKNOWN', source: 'aloplay' },
      { courtKey: 'c1', startTime: '11:00', endTime: '12:00', verdict: 'UNKNOWN', source: 'aloplay' },
    ])
  })

  it('supported AloPlay wipe + AloVarzesh BUSY → no EXTERNAL_BUSY (display Available)', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          slotVerdicts: [],
          occupied: [],
        },
        {
          supported: true,
          source: 'alovarzesh',
          slotVerdicts: [
            {
              courtKey: 'c1',
              startTime: '10:00',
              endTime: '11:00',
              verdict: 'BUSY',
              source: 'alovarzesh',
            },
          ],
        },
      ],
      courts,
      sessionDurationMinutes: 60,
    })

    const confirmed = reconcileConfirmedBusy(verdicts, 60)
    expect(confirmed).toEqual([])

    const state = reconcileSourceVerdicts({ aloplay: 'UNKNOWN', alovarzesh: 'BUSY' })
    expect(state).toBe('UNKNOWN')
    expect(displayBlocksExternal(state)).toBe(false)
  })

  it('unsupported AloPlay silence + AloVarzesh BUSY → still EXTERNAL_BUSY (single mapped source)', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: false,
          source: 'aloplay',
          slotVerdicts: [],
          occupied: [],
        },
        {
          supported: true,
          source: 'alovarzesh',
          slotVerdicts: [
            {
              courtKey: 'c1',
              startTime: '10:00',
              endTime: '11:00',
              verdict: 'BUSY',
              source: 'alovarzesh',
            },
          ],
        },
      ],
      courts,
      sessionDurationMinutes: 60,
    })

    const confirmed = reconcileConfirmedBusy(verdicts, 60)
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]?.state).toBe('EXTERNAL_BUSY')
    expect(confirmed[0]?.source).toBe('alovarzesh')
  })

  it('both sources BUSY with real verdicts → EXTERNAL_BUSY unchanged', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          slotVerdicts: [
            { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY', source: 'aloplay' },
          ],
        },
        {
          supported: true,
          source: 'alovarzesh',
          slotVerdicts: [
            { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY', source: 'alovarzesh' },
          ],
        },
      ],
      courts,
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toHaveLength(1)
  })
})
