import { normalizeIranPhone } from '#shared/phone.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string; phone?: string; locale?: string; avatarUrl?: string | null }>(event)

  let phone: string | null | undefined
  if (body.phone !== undefined) {
    const raw = body.phone?.trim() || ''
    if (!raw) {
      phone = null
    } else {
      phone = normalizeIranPhone(raw)
      if (!phone) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
      }
      const taken = await prisma.user.findFirst({
        where: { phone, NOT: { id: user.id } },
        select: { id: true },
      })
      if (taken) {
        throw createError({ statusCode: 409, statusMessage: 'Phone already registered' })
      }
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name?.trim() || undefined,
      ...(phone !== undefined ? { phone } : {}),
      locale: body.locale === 'en' ? 'en' : body.locale === 'fa' ? 'fa' : undefined,
      avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl?.trim() || null) : undefined,
    },
  })
  return { ok: true }
})
