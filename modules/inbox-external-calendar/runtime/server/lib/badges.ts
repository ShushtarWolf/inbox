import type { ExternalSourceId } from './types'
import { SOURCE_LABELS, SOURCE_ORDER } from './types'

export function formatSourceBadge(sources: ExternalSourceId[]): string {
  if (!sources.length) return ''
  const labels = SOURCE_ORDER
    .filter((source) => sources.includes(source))
    .map((source) => SOURCE_LABELS[source])
  return labels.join(' + ')
}
