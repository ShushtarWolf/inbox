import { getClubMapping, hasExternalMapping } from './mappings'
import { loadInboxOwnerCalendar } from './inboxCalendar'
import { fetchExternalOccupancy } from './adapters'
import { mergeOccupancy } from './merge'
import { persistAndMergeExternalOccupancy } from './occupancySnapshots'
import { enrichCellsWithSourceDetails } from './sourceDetails'
import { SOURCE_LABELS, type ExternalAdapterResult, type ExternalSourceId } from './types'

const POLL_INTERVAL_MS = 25_000

export async function buildCalendarSourcesResponse(opts: {
  clubId: string
  clubSlug: string
  date: string
}) {
  const inbox = await loadInboxOwnerCalendar(opts.clubId, opts.date)
  const mapping = getClubMapping(opts.clubSlug)
  const mapped = hasExternalMapping(opts.clubSlug)

  const external = await fetchExternalOccupancy({
    mapping,
    date: opts.date,
    courts: inbox.courts,
    sessionDurationMinutes: inbox.sessionDurationMinutes,
  })

  const occupied = mapped
    ? await persistAndMergeExternalOccupancy({
        clubId: opts.clubId,
        date: opts.date,
        liveOccupied: external.occupied,
        adapters: external.adapters,
      })
    : external.occupied

  const cells = enrichCellsWithSourceDetails(
    mergeOccupancy(inbox.slots, occupied),
    mapping,
  )

  const noteRows = await prisma.ownerExternalNote.findMany({
    where: { clubId: opts.clubId, date: opts.date },
    select: { courtId: true, startTime: true, note: true },
  })
  const noteByKey = new Map(
    noteRows.map((row) => [`${row.courtId}:${row.startTime.slice(0, 5)}`, row.note] as const),
  )
  const cellsWithNotes = cells.map((cell) => ({
    ...cell,
    ownerNote: noteByKey.get(`${cell.courtId}:${cell.startTime.slice(0, 5)}`) || null,
  }))

  return {
    date: opts.date,
    clubSlug: opts.clubSlug,
    mapped,
    mappingLabel: mapping?.label ?? null,
    message: mapped
      ? null
      : 'این نمای همپوشانی فقط برای باشگاه‌هایی است که علاوه بر اینباکس در سایت دیگری هم لیست شده‌اند.',
    courts: inbox.courts,
    cells: cellsWithNotes,
    sessionDurationMinutes: inbox.sessionDurationMinutes,
    pollIntervalMs: POLL_INTERVAL_MS,
    adapters: external.adapters.map((adapter: ExternalAdapterResult) => ({
      source: adapter.source,
      siteLabel: SOURCE_LABELS[adapter.source as ExternalSourceId],
      supported: adapter.supported,
      error: adapter.error ?? null,
      slotCount: adapter.occupied.length,
      externalClubTitle: mapping?.sources?.[adapter.source as keyof NonNullable<typeof mapping.sources>]
        ? (mapping.sources[adapter.source as keyof NonNullable<typeof mapping.sources>] as { clubTitle?: string | null }).clubTitle ?? null
        : null,
    })),
  }
}
