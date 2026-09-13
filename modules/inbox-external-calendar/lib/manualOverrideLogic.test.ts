import { describe, expect, it } from 'vitest'
import {
  effectiveAvailabilityKind,
  effectiveBlocksBooking,
  findBookingGuardBlockedSlots,
  indexManualOverrides,
} from './manualOverrideLogic'

describe('manualOverrideLogic', () => {
  const slot = { courtId: 'court-1', startTime: '18:00' }
  const externalBusy = [{
    courtKey: 'court-1',
    startTime: '18:00',
    state: 'EXTERNAL_BUSY' as const,
  }]

  it('1. external BUSY + no override → blocked', () => {
    expect(findBookingGuardBlockedSlots([slot], externalBusy, [])).toEqual([slot])
    expect(effectiveBlocksBooking({ externalState: 'EXTERNAL_BUSY' })).toBe(true)
  })

  it('2. external BUSY + RELEASE → allowed', () => {
    expect(findBookingGuardBlockedSlots([slot], externalBusy, [{
      courtId: 'court-1',
      startTime: '18:00',
      type: 'RELEASE',
    }])).toEqual([])
    expect(effectiveBlocksBooking({ externalState: 'EXTERNAL_BUSY', manualOverride: 'RELEASE' })).toBe(false)
    expect(effectiveAvailabilityKind({ externalState: 'EXTERNAL_BUSY', manualOverride: 'RELEASE' })).toBe('available')
  })

  it('3. external FREE + no override → allowed', () => {
    expect(findBookingGuardBlockedSlots([slot], [], [])).toEqual([])
    expect(effectiveBlocksBooking({ externalState: 'AVAILABLE' })).toBe(false)
  })

  it('4. external FREE + BLOCK → blocked', () => {
    expect(findBookingGuardBlockedSlots([slot], [], [{
      courtId: 'court-1',
      startTime: '18:00',
      type: 'BLOCK',
    }])).toEqual([slot])
    expect(effectiveBlocksBooking({ externalState: 'AVAILABLE', manualOverride: 'BLOCK' })).toBe(true)
  })

  it('5. RELEASE only affects exact slot', () => {
    const overrides = [{ courtId: 'court-1', startTime: '18:00', type: 'RELEASE' as const }]
    const occupied = [
      { courtKey: 'court-1', startTime: '18:00', state: 'EXTERNAL_BUSY' as const },
      { courtKey: 'court-1', startTime: '19:00', state: 'EXTERNAL_BUSY' as const },
      { courtKey: 'court-2', startTime: '18:00', state: 'EXTERNAL_BUSY' as const },
    ]
    const slots = [
      { courtId: 'court-1', startTime: '18:00' },
      { courtId: 'court-1', startTime: '19:00' },
      { courtId: 'court-2', startTime: '18:00' },
    ]
    expect(findBookingGuardBlockedSlots(slots, occupied, overrides)).toEqual([
      { courtId: 'court-1', startTime: '19:00' },
      { courtId: 'court-2', startTime: '18:00' },
    ])
  })

  it('6. duplicate override index keeps last type', () => {
    const map = indexManualOverrides([
      { courtId: 'c1', startTime: '10:00', type: 'RELEASE' },
      { courtId: 'c1', startTime: '10:00', type: 'BLOCK' },
    ])
    expect(map.get('c1:10:00')).toBe('BLOCK')
  })

  it('7. UNKNOWN external preserves uncertain unless RELEASE', () => {
    expect(effectiveBlocksBooking({ externalState: 'UNKNOWN' })).toBe(false)
    expect(effectiveAvailabilityKind({ externalState: 'UNKNOWN' })).toBe('uncertain')
    expect(effectiveAvailabilityKind({ externalState: 'UNKNOWN', manualOverride: 'RELEASE' })).toBe('available')
  })

  it('8. STALE and CONFLICT + RELEASE → available', () => {
    expect(effectiveAvailabilityKind({ externalState: 'STALE', manualOverride: 'RELEASE' })).toBe('available')
    expect(effectiveAvailabilityKind({ externalState: 'CONFLICT', manualOverride: 'RELEASE' })).toBe('available')
  })

  it('9. findExternallyBlockedSlots behavior unchanged when no overrides (via guard helper)', () => {
    expect(findBookingGuardBlockedSlots(
      [{ courtId: 'c1', startTime: '09:00' }],
      [{ courtKey: 'c1', startTime: '09:00', state: 'UNKNOWN' }],
      [],
    )).toEqual([])
  })
})
