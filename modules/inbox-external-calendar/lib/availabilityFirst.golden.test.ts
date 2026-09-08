import { describe, expect, it } from 'vitest'
import {
  aloPlayHourVerdicts,
  assessAloPlayCompleteness,
  confirmedBusyFromFreeSet,
  freeSlotKey,
  parseAvailableTimePayload,
} from './aloplayParse'
import { parseAloVarzeshOccupiedTimes, parseAloVarzeshSlotStates } from './alovarzeshParse'
import { displayBlocksExternal, displayIsAvailable } from './observation'
import { filterStaleFromDisplay } from './occupancySnapshots'
import { reconcileConfirmedBusy, reconcileSourceVerdicts } from './reconcile'
import { verdictsForReconcile } from './padFailedSourceUnknown'
import { computeSuspectedSlots } from '../runtime/server/lib/suspected'
import { mergeOccupancy } from '../runtime/server/lib/merge'

type Display = 'AVAILABLE' | 'BUSY'

function displayFromState(state: ReturnType<typeof reconcileSourceVerdicts>): Display {
  return displayBlocksExternal(state) ? 'BUSY' : 'AVAILABLE'
}

/**
 * Golden scenarios for Phase 2 availability-first occupancy.
 * Final display: EXTERNAL_BUSY (any confident source BUSY) → BUSY; else → AVAILABLE.
 */
describe('availabilityFirst golden scenarios', () => {
  const mapped = [{ courtKey: 'c1', productId: 112282, starts: ['10:00', '17:00', '20:00'] }]

  it('1. both sources FREE → display AVAILABLE', () => {
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'FREE', alovarzesh: 'FREE' }))).toBe('AVAILABLE')
  })

  it('2. both sources BUSY → display BUSY', () => {
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'BUSY' }))).toBe('BUSY')
  })

  it('3. BUSY + FREE → EXTERNAL_BUSY → display BUSY', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'FREE' })).toBe('EXTERNAL_BUSY')
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'FREE' }))).toBe('BUSY')
  })

  it('4. BUSY + UNKNOWN → EXTERNAL_BUSY → display BUSY', () => {
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'UNKNOWN' }))).toBe('BUSY')
  })

  it('5. FREE + UNKNOWN → UNKNOWN → display AVAILABLE', () => {
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'FREE', alovarzesh: 'UNKNOWN' }))).toBe('AVAILABLE')
  })

  it('6. both UNKNOWN → display AVAILABLE', () => {
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'UNKNOWN', alovarzesh: 'UNKNOWN' }))).toBe('AVAILABLE')
  })

  it('7. STALE alone → display AVAILABLE', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'STALE' })).toBe('STALE')
    expect(displayFromState(reconcileSourceVerdicts({ aloplay: 'STALE' }))).toBe('AVAILABLE')
  })

  it('8. AloPlay empty free-set → UNKNOWN (never BUSY paint)', () => {
    const { freeSlots } = parseAvailableTimePayload({ data: [], statusCode: 0 })
    const completeness = assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282] })
    expect(completeness).toBe('UNKNOWN')
    expect(confirmedBusyFromFreeSet(mapped, freeSlots, completeness)).toEqual([])
    expect(aloPlayHourVerdicts(mapped, freeSlots, completeness).every((r) => r.verdict === 'UNKNOWN')).toBe(true)
  })

  it('9. AloPlay truncated free-set (<3 clocks) → UNKNOWN missing', () => {
    const { freeSlots } = parseAvailableTimePayload({
      data: [
        { fromTime: '17:00:00', toTime: '18:00:00', productId: 112282 },
        { fromTime: '20:00:00', toTime: '21:00:00', productId: 112282 },
      ],
      statusCode: 0,
    })
    const completeness = assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282] })
    expect(completeness).toBe('UNKNOWN')
    expect(confirmedBusyFromFreeSet(mapped, freeSlots, completeness)).toEqual([])
  })

  it('10. AloPlay COMPLETE missing hour → BUSY', () => {
    const { freeSlots } = parseAvailableTimePayload({
      data: [
        { fromTime: '17:00:00', toTime: '18:00:00', productId: 112282 },
        { fromTime: '20:00:00', toTime: '21:00:00', productId: 112282 },
        { fromTime: '22:00:00', toTime: '23:00:00', productId: 112282 },
      ],
      statusCode: 0,
    })
    const completeness = assessAloPlayCompleteness({ freeSlots, mappedProductIds: [112282] })
    expect(completeness).toBe('COMPLETE')
    const busy = confirmedBusyFromFreeSet(mapped, freeSlots, completeness)
    expect(busy).toContainEqual({ courtKey: 'c1', startTime: '10:00' })
    expect(busy.some((b) => b.startTime === '17:00')).toBe(false)
  })

  it('11. AloPlay PARTIAL (gender partial) → missing UNKNOWN not BUSY', () => {
    const freeSlots = new Set([freeSlotKey(112282, '17:00'), freeSlotKey(112282, '20:00'), freeSlotKey(112282, '22:00')])
    // Adapter would downgrade COMPLETE → PARTIAL when one gender fails.
    const completeness = 'PARTIAL' as const
    expect(confirmedBusyFromFreeSet(mapped, freeSlots, completeness)).toEqual([])
    expect(aloPlayHourVerdicts(mapped, freeSlots, completeness).find((r) => r.startTime === '10:00')?.verdict).toBe('UNKNOWN')
  })

  it('12. rate-limit / adapter error path → empty occupied display AVAILABLE', () => {
    const reconciled = reconcileConfirmedBusy([])
    expect(reconciled).toEqual([])
    expect(displayIsAvailable('UNKNOWN')).toBe(true)
  })

  it('13. AloVarzesh future bare bg-disabled → BUSY (permanent/blocked)', () => {
    const date = '1405-06-15'
    const html = `<div class="day-box flex-timetable row bg-disabled"><input name="product_schedule" value="${date} 10:00" /></div>`
    expect(parseAloVarzeshSlotStates(html, date)[0]?.verdict).toBe('BUSY')
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual(['10:00'])
  })

  it('14. AloVarzesh reserve-over → BUSY', () => {
    const date = '1405-06-15'
    const html = `<div class="day-box flex-timetable row reserve-over"><input name="product_schedule" value="${date} 09:00" /></div>`
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual(['09:00'])
  })

  it('15. AloVarzesh bg-disabled + reserved style → BUSY', () => {
    const date = '1405-06-15'
    const html = `<div class="day-box flex-timetable row bg-disabled box-green-reserve-time"><input name="product_schedule" value="${date} 16:00" /></div>`
    expect(parseAloVarzeshOccupiedTimes(html, date)).toEqual(['16:00'])
  })

  it('16. AloVarzesh past ignoreBefore disabled → UNKNOWN', () => {
    const date = '1405-06-15'
    const html = `<div class="day-box flex-timetable row bg-disabled"><input name="product_schedule" value="${date} 10:00" /></div>`
    expect(parseAloVarzeshSlotStates(html, date, { ignoreBefore: '18:00' })[0]?.verdict).toBe('UNKNOWN')
  })

  it('17. AloVarzesh bookable → FREE', () => {
    const date = '1405-06-15'
    const html = `<div class="day-box flex-timetable row"><input name="product_schedule" value="${date} 12:00" /></div>`
    expect(parseAloVarzeshSlotStates(html, date)[0]?.verdict).toBe('FREE')
  })

  it('18. stale snapshots must not paint display BUSY', () => {
    const display = filterStaleFromDisplay(
      [{ courtKey: 'c1', startTime: '07:00', endTime: '08:00', source: 'aloplay' }],
      { aloplay: false },
    )
    expect(display).toEqual([])
  })

  it('19. suspected yellow only for EXTERNAL_BUSY', () => {
    const inbox = [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE', id: 's1' }]
    expect(computeSuspectedSlots(inbox, [
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay', state: 'EXTERNAL_BUSY' },
    ])).toHaveLength(1)
    expect(computeSuspectedSlots(inbox, [
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay', state: 'UNKNOWN' as never },
    ])).toHaveLength(0)
  })

  it('20. merge paints occupied only for confirmed external busy; uncertainty stays available', () => {
    const mergedBusy = mergeOccupancy(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE' }],
      [{ courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay', state: 'EXTERNAL_BUSY' }],
    )
    expect(mergedBusy[0]?.occupied).toBe(true)
    expect(mergedBusy[0]?.externalState).toBe('EXTERNAL_BUSY')

    const mergedSkip = mergeOccupancy(
      [{ courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE' }],
      [{ courtKey: 'c1', startTime: '10:00', endTime: '11:00', source: 'aloplay', state: 'UNKNOWN' as never }],
    )
    expect(mergedSkip[0]?.occupied).toBe(false)
    expect(mergedSkip[0]?.externalState).toBe('AVAILABLE')

    // Cross-source: BUSY+FREE becomes EXTERNAL_BUSY (one confident busy blocks)
    const confirmed = reconcileConfirmedBusy([
      { courtKey: 'c1', startTime: '10:00', verdict: 'BUSY', source: 'aloplay' },
      { courtKey: 'c1', startTime: '10:00', verdict: 'FREE', source: 'alovarzesh' },
    ])
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]?.state).toBe('EXTERNAL_BUSY')
  })

  it('20a. supported failed/wiped empty + other BUSY → EXTERNAL_BUSY', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          health: 'OFFLINE',
          completeness: 'UNKNOWN',
          error: 'AloPlay credentials missing',
          anomalies: ['no_auth'],
          slotVerdicts: [],
          occupied: [],
        },
        {
          supported: true,
          source: 'alovarzesh',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [
            { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY', source: 'alovarzesh' },
          ],
        },
      ],
      courts: [{ id: 'c1', effectiveOpenHour: 10, effectiveCloseHour: 11 }],
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toHaveLength(1)
    expect(reconcileConfirmedBusy(verdicts, 60)[0]?.state).toBe('EXTERNAL_BUSY')
  })

  it('20b. supported successful empty + other BUSY → EXTERNAL_BUSY (no pad)', () => {
    const verdicts = verdictsForReconcile({
      adapters: [
        {
          supported: true,
          source: 'aloplay',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [],
          occupied: [],
        },
        {
          supported: true,
          source: 'alovarzesh',
          health: 'HEALTHY',
          completeness: 'COMPLETE',
          slotVerdicts: [
            { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY', source: 'alovarzesh' },
          ],
        },
      ],
      courts: [{ id: 'c1', effectiveOpenHour: 10, effectiveCloseHour: 11 }],
      sessionDurationMinutes: 60,
    })
    expect(reconcileConfirmedBusy(verdicts, 60)).toHaveLength(1)
  })

  it('21. AloVarzesh PARTIAL failed court UNKNOWN + AloPlay BUSY → EXTERNAL_BUSY', () => {
    const confirmed = reconcileConfirmedBusy([
      { courtKey: 'courtB', startTime: '10:00', verdict: 'BUSY', source: 'aloplay' },
      { courtKey: 'courtB', startTime: '10:00', verdict: 'UNKNOWN', source: 'alovarzesh' },
      { courtKey: 'courtA', startTime: '10:00', verdict: 'FREE', source: 'alovarzesh' },
    ], 60)
    expect(confirmed.find((r) => r.courtKey === 'courtB')?.state).toBe('EXTERNAL_BUSY')
  })

})
