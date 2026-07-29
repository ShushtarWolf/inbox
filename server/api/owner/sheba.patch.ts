import { isValidSheba, normalizeSheba } from '#shared/settlement.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'finance:payouts')
  const body = await readBody<{ sheba?: string | null }>(event)

  if (body.sheba === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'sheba is required' })
  }

  const raw = body.sheba?.trim() || ''
  if (!raw) {
    const updated = await prisma.club.update({
      where: { id: club.id },
      data: { sheba: null },
      select: { id: true, sheba: true },
    })
    return updated
  }

  const sheba = normalizeSheba(raw)
  if (!sheba || !isValidSheba(sheba)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SHEBA' })
  }

  const updated = await prisma.club.update({
    where: { id: club.id },
    data: { sheba },
    select: { id: true, sheba: true },
  })
  return updated
})
