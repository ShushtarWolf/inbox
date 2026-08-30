import { describe, expect, it } from 'vitest'
import { preferAloPlayOverAlovarzesh } from '../runtime/server/lib/preferAloPlay'
import { mergeOccupancy } from '../runtime/server/lib/merge'
import { computeSuspectedSlots } from '../runtime/server/lib/suspected'
import type { ExternalOccupiedSlot } from '../runtime/server/lib/types'

const COURT = 'court-1'
const START = '10:00'
const END = '11:00'
const mappedCourts = new Set([COURT])

function alovarzeshSlot(): ExternalOccupiedSlot {
  return { courtKey: COURT, startTime: START, endTime: END, source: 'alovarzesh' }
}

function aloplaySlot(): ExternalOccupiedSlot {
  return { courtKey: COURT, startTime: START, endTime: END, source: 'aloplay' }
}

function mergedExternal(
  aloplay: { occupied: ExternalOccupiedSlot[]; error?: string },
  alovarzeshOccupied: ExternalOccupiedSlot[],
) {
  const filtered = preferAloPlayOverAlovarzesh(aloplay, alovarzeshOccupied, mappedCourts)
  return mergeOccupancy(
    [{ courtId: COURT, startTime: START, endTime: END, displayStatus: 'FREE' }],
    [...aloplay.occupied, ...filtered],
  )
}

describe('preferAloPlayOverAlovarzesh', () => {
  it('drops AloVarzesh when AloPlay says free on a mapped court', () => {
    const filtered = preferAloPlayOverAlovarzesh(
      { occupied: [] },
      [alovarzeshSlot()],
      mappedCourts,
    )
    expect(filtered).toEqual([])
  })

  it('keeps AloVarzesh when AloPlay also occupied (they agree)', () => {
    const filtered = preferAloPlayOverAlovarzesh(
      { occupied: [aloplaySlot()] },
      [alovarzeshSlot()],
      mappedCourts,
    )
    expect(filtered).toEqual([alovarzeshSlot()])
  })

  it('keeps AloVarzesh when AloPlay errored', () => {
    const filtered = preferAloPlayOverAlovarzesh(
      { occupied: [], error: 'GetAvailableTime failed' },
      [alovarzeshSlot()],
      mappedCourts,
    )
    expect(filtered).toEqual([alovarzeshSlot()])
  })

  it('keeps AloVarzesh on courts without AloPlay productId mapping', () => {
    const unmappedCourt = 'court-unmapped'
    const slot: ExternalOccupiedSlot = {
      courtKey: unmappedCourt,
      startTime: START,
      endTime: END,
      source: 'alovarzesh',
    }
    const filtered = preferAloPlayOverAlovarzesh(
      { occupied: [] },
      [slot],
      mappedCourts,
    )
    expect(filtered).toEqual([slot])
  })
})

describe('AloPlay preference in mergeOccupancy', () => {
  it('AloPlay free + AloVarzesh occupied → not occupied, no alovarzesh source', () => {
    const merged = mergedExternal({ occupied: [] }, [alovarzeshSlot()])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.occupied).toBe(false)
    expect(merged[0]?.sources).toEqual([])
  })

  it('AloPlay occupied + AloVarzesh occupied → occupied with both sources', () => {
    const merged = mergedExternal({ occupied: [aloplaySlot()] }, [alovarzeshSlot()])
    expect(merged[0]?.occupied).toBe(true)
    expect(merged[0]?.sources).toContain('aloplay')
    expect(merged[0]?.sources).toContain('alovarzesh')
  })

  it('AloPlay occupied + AloVarzesh free → occupied from aloplay only', () => {
    const merged = mergedExternal({ occupied: [aloplaySlot()] }, [])
    expect(merged[0]?.occupied).toBe(true)
    expect(merged[0]?.sources).toEqual(['aloplay'])
  })

  it('AloPlay error + AloVarzesh occupied → occupied from alovarzesh', () => {
    const merged = mergedExternal(
      { occupied: [], error: 'GetAvailableTime failed' },
      [alovarzeshSlot()],
    )
    expect(merged[0]?.occupied).toBe(true)
    expect(merged[0]?.sources).toEqual(['alovarzesh'])
  })
})

describe('AloPlay preference in computeSuspectedSlots', () => {
  it('does not flag suspected when AloPlay says free despite AloVarzesh occupied', () => {
    const aloplay = { occupied: [] as ExternalOccupiedSlot[] }
    const filtered = preferAloPlayOverAlovarzesh(aloplay, [alovarzeshSlot()], mappedCourts)
    const suspected = computeSuspectedSlots(
      [{ courtId: COURT, startTime: START, endTime: END, displayStatus: 'FREE', id: 's1' }],
      [...aloplay.occupied, ...filtered],
    )
    expect(suspected).toEqual([])
  })

  it('still flags suspected when AloPlay occupied and inbox free', () => {
    const aloplay = { occupied: [aloplaySlot()] }
    const filtered = preferAloPlayOverAlovarzesh(aloplay, [], mappedCourts)
    const suspected = computeSuspectedSlots(
      [{ courtId: COURT, startTime: START, endTime: END, displayStatus: 'FREE', id: 's1' }],
      [...aloplay.occupied, ...filtered],
    )
    expect(suspected).toEqual([{
      slotId: 's1',
      startTime: START,
      courtId: COURT,
      suspected: true,
    }])
  })

  it('flags suspected from alovarzesh when AloPlay errored', () => {
    const aloplay = { occupied: [] as ExternalOccupiedSlot[], error: 'timeout' }
    const filtered = preferAloPlayOverAlovarzesh(aloplay, [alovarzeshSlot()], mappedCourts)
    const suspected = computeSuspectedSlots(
      [{ courtId: COURT, startTime: START, endTime: END, displayStatus: 'FREE', id: 's1' }],
      [...aloplay.occupied, ...filtered],
    )
    expect(suspected).toHaveLength(1)
  })
})
