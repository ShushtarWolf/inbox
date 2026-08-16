import { isValidSheba, normalizeSheba } from '#shared/settlement.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ sheba?: string | null }>(event)

  if (body.sheba === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'sheba is required' })
  }

  const raw = body.sheba?.trim() || ''
  if (!raw) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { sheba: null },
      select: { id: true, sheba: true },
    })
    return updated
  }

  const sheba = normalizeSheba(raw)
  if (!sheba || !isValidSheba(sheba)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid SHEBA' })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { sheba },
    select: { id: true, sheba: true },
  })
  return updated
})
