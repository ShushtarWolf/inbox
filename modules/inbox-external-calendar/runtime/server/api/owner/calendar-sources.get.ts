import { getClubMapping, hasExternalMapping } from '../../lib/mappings'
import { loadInboxOwnerCalendar } from '../../lib/inboxCalendar'
import { fetchExternalOccupancy } from '../../lib/adapters'
import { mergeOccupancy } from '../../lib/merge'
import type { ExternalAdapterResult } from '../../lib/types'

const POLL_INTERVAL_MS = 25_000

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const query = getQuery(event)
  const date = (typeof query.date === 'string' && query.date) ? query.date : todayDateStr()

  const inbox = await loadInboxOwnerCalendar(club.id, date)
  const mapping = getClubMapping(club.slug)
  const mapped = hasExternalMapping(club.slug)

  const external = await fetchExternalOccupancy({
    mapping,
    date,
    courts: inbox.courts,
    sessionDurationMinutes: inbox.sessionDurationMinutes,
  })

  const cells = mergeOccupancy(inbox.slots, external.occupied)

  return {
    date,
    clubSlug: club.slug,
    mapped,
    mappingLabel: mapping?.label ?? null,
    message: mapped
      ? null
      : 'این نمای همپوشانی فقط برای باشگاه‌هایی است که علاوه بر اینباکس در سایت دیگری هم لیست شده‌اند.',
    courts: inbox.courts,
    cells,
    sessionDurationMinutes: inbox.sessionDurationMinutes,
    pollIntervalMs: POLL_INTERVAL_MS,
    adapters: external.adapters.map((adapter: ExternalAdapterResult) => ({
      source: adapter.source,
      supported: adapter.supported,
      error: adapter.error ?? null,
      slotCount: adapter.occupied.length,
    })),
  }
})
