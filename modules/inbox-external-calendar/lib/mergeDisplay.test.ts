import { describe, expect, it } from 'vitest'
import { mergeOccupancyFromVerdicts } from '../runtime/server/lib/merge'
import { reconcileConfirmedBusy } from './reconcile'

describe('three-state staff overlay', () => {
  const inbox = [
    { courtId: 'c1', startTime: '10:00', endTime: '11:00', displayStatus: 'FREE' },
    { courtId: 'c1', startTime: '11:00', endTime: '12:00', displayStatus: 'FREE' },
    { courtId: 'c1', startTime: '12:00', endTime: '13:00', displayStatus: 'FREE' },
  ]

  it('busy_single vs busy_multi badges', () => {
    const verdicts = [
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'BUSY' as const, source: 'aloplay' },
      { courtKey: 'c1', startTime: '10:00', endTime: '11:00', verdict: 'FREE' as const, source: 'alovarzesh' },
      { courtKey: 'c1', startTime: '11:00', endTime: '12:00', verdict: 'BUSY' as const, source: 'aloplay' },
      { courtKey: 'c1', startTime: '11:00', endTime: '12:00', verdict: 'BUSY' as const, source: 'alovarzesh' },
    ]
    const busy = reconcileConfirmedBusy(verdicts)
    const cells = mergeOccupancyFromVerdicts(inbox, verdicts, busy)
    const single = cells.find((c) => c.startTime === '10:00')!
    const multi = cells.find((c) => c.startTime === '11:00')!
    expect(single.externalKind).toBe('busy_single')
    expect(single.badge).toContain('مشغول')
    expect(single.badge).toContain('الوپلی')
    expect(multi.externalKind).toBe('busy_multi')
    expect(multi.badge).toContain('الوپلی')
    expect(multi.badge).toContain('الوورزش')
    expect(multi.sources.filter((s) => s !== 'inbox').sort()).toEqual(['aloplay', 'alovarzesh'])
  })

  it('uncertain when UNKNOWN without BUSY', () => {
    const verdicts = [
      { courtKey: 'c1', startTime: '12:00', endTime: '13:00', verdict: 'UNKNOWN' as const, source: 'aloplay' },
      { courtKey: 'c1', startTime: '12:00', endTime: '13:00', verdict: 'FREE' as const, source: 'alovarzesh' },
    ]
    const busy = reconcileConfirmedBusy(verdicts)
    const cells = mergeOccupancyFromVerdicts(inbox, verdicts, busy)
    const cell = cells.find((c) => c.startTime === '12:00')!
    expect(cell.externalKind).toBe('uncertain')
    expect(cell.occupied).toBe(false)
    expect(cell.badge).toContain('مشکوک')
  })
})
