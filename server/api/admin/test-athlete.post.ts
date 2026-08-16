import { normalizeIranPhone, phoneToSyntheticEmail } from '#shared/phone.ts'

/** Upsert a non-owner ATHLETE for product testing (OTP bypass). */
export const TEST_ATHLETE_PHONE = '09121234567'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ phone?: string; name?: string }>(event).catch(() => ({} as { phone?: string; name?: string }))
  const phone = normalizeIranPhone(body.phone || TEST_ATHLETE_PHONE)
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone' })
  }

  const email = phoneToSyntheticEmail(phone)
  const name = body.name?.trim() || 'کاربر تست'
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { email }] },
  })

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          phone,
          role: 'ATHLETE',
          phoneVerifiedAt: new Date(),
          disabledAt: null,
          name: existing.name || name,
        },
        select: { id: true, email: true, phone: true, role: true, name: true },
      })
    : await prisma.user.create({
        data: {
          email,
          name,
          nameEn: 'Test Athlete',
          role: 'ATHLETE',
          phone,
          phoneVerifiedAt: new Date(),
        },
        select: { id: true, email: true, phone: true, role: true, name: true },
      })

  return {
    ok: true,
    created: !existing,
    user,
    hint: 'Use SMS_PROVIDER=log locally to get debugCode OTP; production always requires real SMS OTP',
  }
})
