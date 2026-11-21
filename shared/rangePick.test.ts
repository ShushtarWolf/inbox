import { describe, expect, it } from 'vitest'
import {
  initialSequentialRangePhase,
  pickRangeDay,
  pickSequentialRangeTap,
  seasonEditDateError,
  seasonEditLocksStart,
  sequentialRangeHintKind,
} from './rangePick'

// Eli's season: 7 Aban 1405 → stored end 26 Azar 1405 (last Thursday session); today 22 Aban 1405.
const START = '2026-10-29' // 7 Aban
const END = '2026-12-17' // 26 Azar
const TODAY = '2026-11-13' // 22 Aban
const ABAN_30 = '2026-11-21'

// IB-49: today = 30 Aban; owner taps 1 Azar then 30 Azar for a fresh season range.
const AZAR_1 = '2026-11-22'
const AZAR_30 = '2026-12-21'

describe('sequentialRangeHintKind', () => {
  it('returns Persian hint keys only during the two-tap flow', () => {
    expect(sequentialRangeHintKind('pick-start')).toBe('start')
    expect(sequentialRangeHintKind('pick-end')).toBe('end')
    expect(sequentialRangeHintKind('adjust')).toBeNull()
  })
})

describe('pickSequentialRangeTap', () => {
  it('IB-49: prefilled start (today) is replaced on the first tap (1 Azar)', () => {
    const first = pickSequentialRangeTap({ start: ABAN_30, end: '' }, AZAR_1, 'pick-start')
    expect(first).toEqual({
      state: { start: AZAR_1, end: '' },
      phase: 'pick-end',
    })
  })

  it('sets end on the second tap (1 Azar → 30 Azar)', () => {
    const second = pickSequentialRangeTap({ start: AZAR_1, end: '' }, AZAR_30, 'pick-end')
    expect(second.state).toEqual({ start: AZAR_1, end: AZAR_30 })
    expect(second.phase).toBe('adjust')
  })

  it('with no end on the model, phase stays pick-start until the range is complete', () => {
    expect(initialSequentialRangePhase({ start: ABAN_30, end: '' })).toBe('pick-start')
    expect(initialSequentialRangePhase({ start: AZAR_1, end: AZAR_30 })).toBe('adjust')
  })
})

describe('pickRangeDay', () => {
  it('reproduces the bug: unlocked tap on 30 Aban moves the START (nearer endpoint)', () => {
    expect(pickRangeDay({ start: START, end: END }, ABAN_30, { minDate: TODAY }))
      .toEqual({ start: ABAN_30, end: END })
  })

  it('locked start: tap on 30 Aban shortens the end and keeps 7 Aban', () => {
    expect(pickRangeDay({ start: START, end: END }, ABAN_30, { minDate: TODAY, lockStart: true }))
      .toEqual({ start: START, end: ABAN_30 })
  })

  it('locked start: tap after the end extends it', () => {
    expect(pickRangeDay({ start: START, end: END }, '2027-01-19', { minDate: TODAY, lockStart: true }))
      .toEqual({ start: START, end: '2027-01-19' })
  })

  it('locked start: a day before today is ignored', () => {
    expect(pickRangeDay({ start: START, end: END }, '2026-11-10', { minDate: TODAY, lockStart: true }))
      .toEqual({ start: START, end: END })
  })

  it('locked start: a day before the start is ignored', () => {
    expect(pickRangeDay({ start: '2026-11-20', end: '2026-12-01' }, '2026-11-15', { lockStart: true }))
      .toEqual({ start: '2026-11-20', end: '2026-12-01' })
  })

  it('unlocked: first tap starts, second ends (reordered when earlier)', () => {
    const a = pickRangeDay({ start: '', end: '' }, '2026-11-20')
    expect(a).toEqual({ start: '2026-11-20', end: '' })
    expect(pickRangeDay(a, '2026-11-15')).toEqual({ start: '2026-11-15', end: '2026-11-20' })
    expect(pickRangeDay(a, '2026-11-25')).toEqual({ start: '2026-11-20', end: '2026-11-25' })
  })

  it('unlocked: tap nearer the end moves the end', () => {
    expect(pickRangeDay({ start: '2026-11-20', end: '2026-12-20' }, '2026-12-15'))
      .toEqual({ start: '2026-11-20', end: '2026-12-15' })
  })
})

describe('seasonEditDateError', () => {
  const base = { storedStart: START, storedFinish: END, today: TODAY }
  it('accepts an unchanged past start with a shortened end', () => {
    expect(seasonEditDateError({ ...base, startDate: START, finishDate: ABAN_30 })).toBeNull()
  })
  it('accepts an extended end', () => {
    expect(seasonEditDateError({ ...base, startDate: START, finishDate: '2027-01-19' })).toBeNull()
  })
  it('accepts an unchanged (already past) end on an ended season', () => {
    expect(seasonEditDateError({ storedStart: '2026-09-01', storedFinish: '2026-10-01', today: TODAY, startDate: '2026-09-01', finishDate: '2026-10-01' })).toBeNull()
  })
  it('rejects moving the start to another past day', () => {
    expect(seasonEditDateError({ ...base, startDate: '2026-11-01', finishDate: ABAN_30 })).toBe('START_IN_PAST')
  })
  it('rejects a changed end before today', () => {
    expect(seasonEditDateError({ ...base, startDate: START, finishDate: '2026-11-10' })).toBe('FINISH_IN_PAST')
  })
  it('rejects end before start', () => {
    expect(seasonEditDateError({ ...base, startDate: '2026-11-20', finishDate: '2026-11-19' })).toBe('FINISH_BEFORE_START')
  })
  it('allows moving a future start to today or later', () => {
    expect(seasonEditDateError({ storedStart: '2026-11-20', storedFinish: '2026-12-20', today: TODAY, startDate: TODAY, finishDate: '2026-12-20' })).toBeNull()
  })
})

describe('seasonEditLocksStart', () => {
  it('locks only when the stored start is before today', () => {
    expect(seasonEditLocksStart(START, TODAY)).toBe(true)
    expect(seasonEditLocksStart(TODAY, TODAY)).toBe(false)
    expect(seasonEditLocksStart('2026-11-20', TODAY)).toBe(false)
    expect(seasonEditLocksStart('', TODAY)).toBe(false)
  })
})
