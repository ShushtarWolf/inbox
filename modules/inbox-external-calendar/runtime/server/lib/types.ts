export type ExternalSourceId = 'inbox' | 'aloplay' | 'alovarzesh' | 'courtic'

export const SOURCE_LABELS: Record<ExternalSourceId, string> = {
  inbox: 'اینباکس',
  aloplay: 'الوپلی',
  alovarzesh: 'الوورزش',
  courtic: 'کورتیک',
}

export const SOURCE_ORDER: ExternalSourceId[] = ['inbox', 'aloplay', 'alovarzesh', 'courtic']

export interface ExternalOccupiedSlot {
  courtKey: string
  startTime: string
  endTime: string
  source: ExternalSourceId
}

export interface MergedCell {
  courtId: string
  startTime: string
  endTime: string
  inboxStatus: string
  sources: ExternalSourceId[]
  badge: string
  occupied: boolean
}

export interface InboxCalendarSlot {
  courtId: string
  startTime: string
  endTime: string
  displayStatus: string
}

export interface AloPlaySourceConfig {
  clubId: number | null
  comment?: string
}

export interface UnsupportedSourceConfig {
  supported: false
}

export interface CourtExternalMapping {
  aloplay?: { courtId: number | null }
  alovarzesh?: UnsupportedSourceConfig
  courtic?: UnsupportedSourceConfig
}

export interface CourtMapping {
  inboxCourtId?: string
  inboxCourtName?: string
  external?: CourtExternalMapping
}

export interface ClubMapping {
  inboxSlug: string
  label?: string
  sources?: {
    aloplay?: AloPlaySourceConfig
    alovarzesh?: UnsupportedSourceConfig
    courtic?: UnsupportedSourceConfig
  }
  courts?: CourtMapping[]
}

export interface ExternalAdapterResult {
  source: ExternalSourceId
  occupied: ExternalOccupiedSlot[]
  supported: boolean
  error?: string
}
