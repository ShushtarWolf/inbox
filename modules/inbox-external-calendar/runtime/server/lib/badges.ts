import type { ExternalSourceId } from './types'
import { SOURCE_LABELS, SOURCE_ORDER } from './types'

export function formatSourceBadge(sources: ExternalSourceId[]): string {
  return formatSourceLabelList(sources).join(' + ')
}

/** Ordered Persian labels for stacked/narrow UI (admin calendar cells). */
export function formatSourceLabelList(sources: ExternalSourceId[]): string[] {
  if (!sources.length) return []
  return SOURCE_ORDER
    .filter((source) => sources.includes(source))
    .map((source) => SOURCE_LABELS[source])
}

/** External booking sites only — excludes inbox for FREE-cell overlay badges. */
export function formatExternalSourceLabels(sources: ExternalSourceId[]): string[] {
  return formatSourceLabelList(sources.filter((source) => source !== 'inbox'))
}

export type ExternalDisplayKind = 'busy_single' | 'busy_multi' | 'uncertain' | 'clear'

/** Owner / coach / admin overlay badge for the three staff-visible modes. */
export function formatExternalDisplayBadge(
  kind: ExternalDisplayKind | undefined,
  sources: ExternalSourceId[],
): string {
  const labels = formatExternalSourceLabels(sources)
  if (kind === 'busy_single' || kind === 'busy_multi') {
    return labels.length ? `مشغول · ${labels.join(' + ')}` : 'مشغول'
  }
  if (kind === 'uncertain') {
    return labels.length
      ? `مشکوک — با ${labels.join(' و ')} هماهنگ کنید`
      : 'مشکوک'
  }
  return formatSourceBadge(sources)
}
