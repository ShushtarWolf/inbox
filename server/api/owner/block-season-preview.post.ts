import { previewSeasonBlock } from '../../utils/blockSeason'
import { resolveSeasonSessionsFromBody } from '../../utils/seasonRequestSessions'

/** Dry-run season-range block (date range + weekly pattern like season reserve). */
export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody(event)
  const sessions = await resolveSeasonSessionsFromBody(club.id, body)
  const result = await previewSeasonBlock({ clubId: club.id, sessions })
  return {
    willBlockCount: result.willBlockCount,
    skippedCount: result.skippedCount,
    willBlock: result.willBlock,
    conflicts: result.conflicts,
  }
})
