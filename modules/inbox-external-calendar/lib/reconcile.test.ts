import { describe, expect, it } from 'vitest'
import {
  reconcileConfirmedBusy,
  reconcileSourceVerdicts,
} from './reconcile'
import { displayBlocksExternal, displayIsAvailable } from './observation'

describe('reconcileSourceVerdicts', () => {
  it('both FREE → AVAILABLE', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'FREE', alovarzesh: 'FREE' })).toBe('AVAILABLE')
  })

  it('both BUSY → EXTERNAL_BUSY', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'BUSY' })).toBe('EXTERNAL_BUSY')
  })

  it('BUSY + FREE → EXTERNAL_BUSY (one confident busy is enough)', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'FREE' })).toBe('EXTERNAL_BUSY')
  })

  it('BUSY + UNKNOWN → EXTERNAL_BUSY (confident busy still blocks)', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'UNKNOWN' })).toBe('EXTERNAL_BUSY')
  })

  it('FREE + UNKNOWN → UNKNOWN', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'FREE', alovarzesh: 'UNKNOWN' })).toBe('UNKNOWN')
  })

  it('both UNKNOWN → UNKNOWN', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'UNKNOWN', alovarzesh: 'UNKNOWN' })).toBe('UNKNOWN')
  })

  it('STALE alone → STALE', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'STALE' })).toBe('STALE')
  })

  it('BUSY + STALE → EXTERNAL_BUSY', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY', alovarzesh: 'STALE' })).toBe('EXTERNAL_BUSY')
  })

  it('single BUSY → EXTERNAL_BUSY', () => {
    expect(reconcileSourceVerdicts({ aloplay: 'BUSY' })).toBe('EXTERNAL_BUSY')
  })
})

describe('display invariant', () => {
  it('only EXTERNAL_BUSY blocks', () => {
    for (const state of ['AVAILABLE', 'UNKNOWN', 'STALE', 'CONFLICT'] as const) {
      expect(displayBlocksExternal(state)).toBe(false)
      expect(displayIsAvailable(state)).toBe(true)
    }
    expect(displayBlocksExternal('EXTERNAL_BUSY')).toBe(true)
  })
})

describe('reconcileConfirmedBusy', () => {
  it('emits occupied when any source is BUSY — including BUSY+FREE', () => {
    const busy = reconcileConfirmedBusy([
      { courtKey: 'c1', startTime: '10:00', verdict: 'BUSY', source: 'aloplay' },
      { courtKey: 'c1', startTime: '10:00', verdict: 'FREE', source: 'alovarzesh' },
      { courtKey: 'c1', startTime: '11:00', verdict: 'BUSY', source: 'aloplay' },
      { courtKey: 'c1', startTime: '11:00', verdict: 'BUSY', source: 'alovarzesh' },
    ])
    expect(busy.map((b) => b.startTime)).toEqual(['10:00', '11:00'])
    expect(busy.every((b) => b.state === 'EXTERNAL_BUSY')).toBe(true)
  })

  it('emits BUSY+UNKNOWN as occupied', () => {
    const busy = reconcileConfirmedBusy([
      { courtKey: 'c1', startTime: '10:00', verdict: 'BUSY', source: 'aloplay' },
      { courtKey: 'c1', startTime: '10:00', verdict: 'UNKNOWN', source: 'alovarzesh' },
    ])
    expect(busy).toHaveLength(1)
    expect(busy[0]?.state).toBe('EXTERNAL_BUSY')
  })
})
