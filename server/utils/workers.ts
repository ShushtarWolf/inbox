import type { DayTimeRange } from '#shared/recurringSessions.ts'
import {
  normalizeAccessAreas,
  normalizeWorkerPosition,
  type WorkerAccessArea,
  type WorkerPosition,
} from '#shared/workerAccess.ts'

export const WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type WorkerWorkingHours = Record<string, DayTimeRange>

export function parseWorkingHours(json: string | null | undefined): WorkerWorkingHours {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return {}
    const result: WorkerWorkingHours = {}
    for (const [day, range] of Object.entries(parsed)) {
      if (range && typeof range === 'object' && 'start' in range && 'end' in range) {
        const r = range as { start: unknown; end: unknown }
        if (typeof r.start === 'string' && typeof r.end === 'string') {
          result[day] = { start: r.start, end: r.end }
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

export function serializeWorkingHours(hours: WorkerWorkingHours): string {
  return JSON.stringify(hours)
}

export function mapWorkerRecord(worker: {
  id: string
  firstName: string
  lastName: string
  mobile: string
  emergencyMobile: string | null
  position: string
  workingHoursJson: string | null
  accessAreasJson: string | null
  active: boolean
  createdAt: Date
}) {
  return {
    id: worker.id,
    firstName: worker.firstName,
    lastName: worker.lastName,
    mobile: worker.mobile,
    emergencyMobile: worker.emergencyMobile,
    position: normalizeWorkerPosition(worker.position),
    workingHours: parseWorkingHours(worker.workingHoursJson),
    accessAreasJson: worker.accessAreasJson,
    active: worker.active,
    createdAt: worker.createdAt.toISOString(),
  }
}

export function serializeAccessAreas(areas: WorkerAccessArea[]): string {
  return JSON.stringify(normalizeAccessAreas(areas))
}
