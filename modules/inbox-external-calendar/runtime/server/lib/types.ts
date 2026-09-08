export type ExternalSourceId = 'inbox' | 'aloplay' | 'alovarzesh' | 'courtic'

export const SOURCE_LABELS: Record<ExternalSourceId, string> = {
  inbox: 'اینباکس',
  aloplay: 'الوپلی',
  alovarzesh: 'الوورزش',
  courtic: 'کورتیک',
}

export const SOURCE_ORDER: ExternalSourceId[] = ['inbox', 'aloplay', 'alovarzesh', 'courtic']

export type Completeness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN'
export type SourceHealth = 'HEALTHY' | 'DEGRADED' | 'SUSPICIOUS' | 'OFFLINE'
export type ExternalCellState =
  | 'AVAILABLE'
  | 'EXTERNAL_BUSY'
  | 'UNKNOWN'
  | 'STALE'
  | 'CONFLICT'
export type SourceSlotVerdict = 'FREE' | 'BUSY' | 'UNKNOWN' | 'STALE'

export interface ExternalOccupiedSlot {
  courtKey: string
  startTime: string
  endTime: string
  source: ExternalSourceId
  /** Optional state; suspected/display must only treat EXTERNAL_BUSY as blocking. */
  state?: ExternalCellState
}

export interface AdapterSlotVerdict {
  courtKey: string
  startTime: string
  endTime?: string
  verdict: SourceSlotVerdict
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
  /**
   * Shows as occupied for overlay.
   * External contribution only when EXTERNAL_BUSY after reconcile; inbox occupancy still sets occupied.
   */
  occupied: boolean
  sourceDetails?: SourceDetail[]
  /** Owner desk note for this hour (external overlay only). */
  ownerNote?: string | null
  /** Reconciled external observation (availability-first). */
  externalState?: ExternalCellState
  /** Staff overlay: busy_single | busy_multi | uncertain | clear */
  externalKind?: 'busy_single' | 'busy_multi' | 'uncertain' | 'clear'
  /** Sources that contributed definite BUSY (for multi badge). */
  busySources?: ExternalSourceId[]
  /** Sources that are UNKNOWN/STALE (for uncertain badge). */
  uncertainSources?: ExternalSourceId[]
  freshness?: string
  confidence?: string
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
  /** Confirmed BUSY slots for this adapter only (never UNKNOWN/STALE guesses). */
  occupied: ExternalOccupiedSlot[]
  supported: boolean
  error?: string
  completeness?: Completeness
  health?: SourceHealth
  slotVerdicts?: AdapterSlotVerdict[]
  anomalies?: string[]
}
