export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string; phone?: string; locale?: string; avatarUrl?: string | null }>(event)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      locale: body.locale === 'en' ? 'en' : body.locale === 'fa' ? 'fa' : undefined,
      avatarUrl: body.avatarUrl !== undefined ? (body.avatarUrl?.trim() || null) : undefined,
    },
  })
  return { ok: true }
})
