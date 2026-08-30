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

export interface SourceDetail {
  source: ExternalSourceId
  siteLabel: string
  externalClubTitle: string | null
}

export interface MergedCell {
  courtId: string
  startTime: string
  endTime: string
  inboxStatus: string
  sources: ExternalSourceId[]
  badge: string
  occupied: boolean
  sourceDetails?: SourceDetail[]
}

export interface InboxCalendarSlot {
  courtId: string
  startTime: string
  endTime: string
  displayStatus: string
}

export interface ExternalSourceConfig {
  clubId?: number | null
  clubTitle?: string | null
  comment?: string
  supported?: false
  /** AloPlay ProductGender: 1=Female, 2=Male */
  productGender?: number | null
}

export interface AloPlaySourceConfig extends ExternalSourceConfig {
  clubId: number | null
  /** ProductGender values to union (e.g. [2, 1] = Male + Female). */
  genders?: number[]
}

export interface AloVarzeshSourceConfig extends ExternalSourceConfig {
  clubTitle?: string | null
}

export interface UnsupportedSourceConfig {
  supported: false
}

export interface AloPlayCourtMapping {
  /** AloPlay product id (GetByTime identity). */
  productId: number | null
  /** @deprecated Use productId. Kept for legacy mapping JSON only. */
  courtId?: number | null
  name?: string
}

export interface CourtExternalMapping {
  aloplay?: AloPlayCourtMapping
  alovarzesh?: { productId: number | null }
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
    alovarzesh?: AloVarzeshSourceConfig | (UnsupportedSourceConfig & ExternalSourceConfig)
    courtic?: UnsupportedSourceConfig & ExternalSourceConfig
  }
  courts?: CourtMapping[]
}

export interface ExternalAdapterResult {
  source: ExternalSourceId
  occupied: ExternalOccupiedSlot[]
  supported: boolean
  error?: string
}
