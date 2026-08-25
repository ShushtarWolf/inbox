import type { ExternalAdapterResult } from '../types'

export async function fetchAloVarzeshOccupancy(): Promise<ExternalAdapterResult> {
  return {
    source: 'alovarzesh',
    occupied: [],
    supported: false,
    error: 'الوورزش adapter is not implemented in this experiment.',
  }
}
