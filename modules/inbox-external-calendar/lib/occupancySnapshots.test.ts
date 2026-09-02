import { describe, expect, it } from 'vitest'
import {
  buildLiveSucceededBySource,
  isExternalAdapterLiveSuccess,
  mergeLiveWithStoredOccupancy,
} from './occupancySnapshots'

describe('isExternalAdapterLiveSuccess', () => {
  it('treats adapter error with empty occupancy as failed live fetch', () => {
    expect(isExternalAdapterLiveSuccess({
      source: 'aloplay',
      supported: true,
      occupied: [],
      error: 'GetAvailableTime failed',
    })).toBe(false)
  })

  it('treats successful fetch with empty occupancy as live success', () => {
    expect(isExternalAdapterLiveSuccess({
      source: 'alovarzesh',
      supported: true,
      occupied: [],
    })).toBe(true)
  })

  it('treats partial AloVarzesh success as live success when some slots returned', () => {
    expect(isExternalAdapterLiveSuccess({
      source: 'alovarzesh',
      supported: true,
      occupied: [{ courtKey: 'c1', startTime: '16:00', endTime: '17:00', source: 'alovarzesh' }],
      error: 'product 3336 failed',
    })).toBe(true)
  })
})

describe('buildLiveSucceededBySource', () => {
  it('marks AloPlay failed and AloVarzesh succeeded independently', () => {
    const map = buildLiveSucceededBySource([
      {
        source: 'aloplay',
        supported: true,
        occupied: [],
        error: 'GetAvailableTime returned no free slots — refusing to mark entire day occupied',
      },
      {
        source: 'alovarzesh',
        supported: true,
        occupied: [{ courtKey: 'c1', startTime: '16:00', endTime: '17:00', source: 'alovarzesh' }],
      },
    ])
    expect(map).toEqual({ aloplay: false, alovarzesh: true })
  })
})

describe('mergeLiveWithStoredOccupancy per-source fallback', () => {
  it('keeps AloPlay snapshots when live failed but uses live AloVarzesh when it succeeded', () => {
    const merged = mergeLiveWithStoredOccupancy(
      [{
        courtKey: 'c1',
        startTime: '16:00',
        endTime: '17:00',
        source: 'alovarzesh',
      }],
      [
        {
          courtKey: 'c1',
          startTime: '07:00',
          endTime: '08:00',
          source: 'aloplay',
        },
        {
          courtKey: 'c1',
          startTime: '08:00',
          endTime: '09:00',
          source: 'aloplay',
        },
      ],
      { aloplay: false, alovarzesh: true },
    )
    expect(merged).toEqual([
      {
        courtKey: 'c1',
        startTime: '07:00',
        endTime: '08:00',
        source: 'aloplay',
      },
      {
        courtKey: 'c1',
        startTime: '08:00',
        endTime: '09:00',
        source: 'aloplay',
      },
      {
        courtKey: 'c1',
        startTime: '16:00',
        endTime: '17:00',
        source: 'alovarzesh',
      },
    ])
  })
})
