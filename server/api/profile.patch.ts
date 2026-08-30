import { toSessionUser } from '../utils/auth'
import { parseClubImageInput } from '#shared/clubImageUrl.ts'
import { parseGender } from '#shared/gender.ts'
import { normalizeIranPhone } from '#shared/phone.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    name?: string
    phone?: string
    locale?: string
    gender?: string | null
    avatarUrl?: string | null
  }>(event)

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

  let avatarUrl: string | null | undefined
  if (body.avatarUrl !== undefined) {
    const parsed = parseClubImageInput(body.avatarUrl)
    if (!parsed.ok) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid avatar URL' })
    }
    avatarUrl = parsed.value
  }

  let gender: 'MALE' | 'FEMALE' | null | undefined
  if (body.gender !== undefined) {
    if (body.gender === null || body.gender === '') {
      gender = null
    } else {
      const parsed = parseGender(body.gender)
      if (!parsed) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid gender' })
      }
      gender = parsed
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name?.trim() || undefined,
      ...(phone !== undefined ? { phone } : {}),
      locale: body.locale === 'en' ? 'en' : body.locale === 'fa' ? 'fa' : undefined,
      ...(gender !== undefined ? { gender } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
  })
  await setUserSession(event, { user: toSessionUser(updated) })
  return { ok: true, avatarUrl: updated.avatarUrl || null, gender: updated.gender || null }
})
