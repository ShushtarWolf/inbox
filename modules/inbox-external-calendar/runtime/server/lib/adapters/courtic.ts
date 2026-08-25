import type { ExternalAdapterResult } from '../types'

export async function fetchCourticOccupancy(): Promise<ExternalAdapterResult> {
  return {
    source: 'courtic',
    occupied: [],
    supported: false,
    error: 'کورتیک adapter is not implemented in this experiment.',
  }
}
