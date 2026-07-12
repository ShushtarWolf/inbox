export const WORKER_POSITIONS = [
  'RECEPTION',
  'MAINTENANCE',
  'SECURITY',
  'CLEANING',
  'OTHER',
] as const

export type WorkerPosition = (typeof WORKER_POSITIONS)[number]

export const WORKER_ACCESS_AREAS = [
  'calendar',
  'equipments',
  'packages',
  'crm',
  'finance',
  'facilities',
] as const

export type WorkerAccessArea = (typeof WORKER_ACCESS_AREAS)[number]

export function normalizeWorkerPosition(value?: string): WorkerPosition {
  if (value && WORKER_POSITIONS.includes(value as WorkerPosition)) {
    return value as WorkerPosition
  }
  return 'RECEPTION'
}

export function normalizeAccessAreas(areas: string[]): WorkerAccessArea[] {
  return [...new Set(areas.filter((area): area is WorkerAccessArea =>
    WORKER_ACCESS_AREAS.includes(area as WorkerAccessArea),
  ))]
}

export function parseAccessAreas(json: string | null | undefined): WorkerAccessArea[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? normalizeAccessAreas(parsed) : []
  } catch {
    return []
  }
}
