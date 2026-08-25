import { SOURCE_LABELS } from './types'
import type { ClubMapping, ExternalSourceId, MergedCell, SourceDetail } from './types'

export function externalClubTitleForSource(
  mapping: ClubMapping | null,
  source: ExternalSourceId,
): string | null {
  if (!mapping || source === 'inbox') return mapping?.label ?? null
  const config = mapping.sources?.[source]
  if (!config || !('clubTitle' in config)) return null
  return config.clubTitle ?? null
}

export function sourceDetailsForCell(
  mapping: ClubMapping | null,
  sources: ExternalSourceId[],
): SourceDetail[] {
  return sources.map((source) => ({
    source,
    siteLabel: SOURCE_LABELS[source],
    externalClubTitle: externalClubTitleForSource(mapping, source),
  }))
}

export function enrichCellsWithSourceDetails(
  cells: MergedCell[],
  mapping: ClubMapping | null,
) {
  return cells.map((cell) => ({
    ...cell,
    sourceDetails: sourceDetailsForCell(mapping, cell.sources),
  }))
}
