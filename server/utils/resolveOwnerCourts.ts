import { uniqueOrdered } from '#shared/courtSlotSelection.ts'

/** Prefer explicit courtIds; fall back to the court of an anchor slotId. */
export async function resolveOwnerCourtIds(
  clubId: string,
  body: { courtIds?: string[]; slotId?: string },
): Promise<string[]> {
  const requested = uniqueOrdered((body.courtIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  if (requested.length) {
    const found = await prisma.court.findMany({
      where: { clubId, id: { in: requested } },
      select: { id: true },
    })
    const foundSet = new Set(found.map((court) => court.id))
    const ordered = requested.filter((id) => foundSet.has(id))
    if (ordered.length !== requested.length) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid courtIds' })
    }
    return ordered
  }

  if (body.slotId) {
    const slot = await prisma.slot.findFirst({
      where: { id: body.slotId, court: { clubId } },
      select: { courtId: true },
    })
    if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
    return [slot.courtId]
  }

  throw createError({ statusCode: 400, statusMessage: 'courtIds or slotId required' })
}
