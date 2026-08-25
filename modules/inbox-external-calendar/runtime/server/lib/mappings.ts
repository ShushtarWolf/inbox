import type { ClubMapping } from './types'
import iustTennis from '../../../mappings/iust-tennis.json'

const REGISTRY: Record<string, ClubMapping> = {
  'iust-tennis': iustTennis as ClubMapping,
}

export function getClubMapping(slug: string): ClubMapping | null {
  return REGISTRY[slug] ?? null
}

export function hasExternalMapping(slug: string): boolean {
  return Boolean(getClubMapping(slug))
}
