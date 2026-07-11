import type { EquipmentCategory } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'settings')
  const body = await readBody<{
    nameFa?: string
    nameEn?: string
    addressFa?: string
    addressEn?: string
    city?: string
    district?: string | null
    openHour?: number
    closeHour?: number
    cancellationWindowHours?: number
    rescheduleWindowHours?: number
    waitlistEnabled?: boolean
    phone?: string | null
    whatsapp?: string | null
    image?: string | null
  }>(event)

  const data: Record<string, unknown> = {}

  if (body.nameFa !== undefined) {
    const value = body.nameFa.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'nameFa is required' })
    data.nameFa = value
  }
  if (body.nameEn !== undefined) {
    const value = body.nameEn.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'nameEn is required' })
    data.nameEn = value
  }
  if (body.addressFa !== undefined) {
    const value = body.addressFa.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'addressFa is required' })
    data.addressFa = value
  }
  if (body.addressEn !== undefined) {
    const value = body.addressEn.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'addressEn is required' })
    data.addressEn = value
  }
  if (body.city !== undefined) {
    const value = body.city.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'city is required' })
    data.city = value
  }
  if (body.district !== undefined) data.district = body.district?.trim() || null
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp?.trim() || null
  if (body.image !== undefined) {
    const value = body.image?.trim() || null
    if (value && !/^https?:\/\/.+/i.test(value) && !value.startsWith('/uploads/')) {
      throw createError({ statusCode: 400, statusMessage: 'image must be a valid URL' })
    }
    data.image = value
  }
  if (body.waitlistEnabled !== undefined) data.waitlistEnabled = Boolean(body.waitlistEnabled)

  for (const key of ['openHour', 'closeHour', 'cancellationWindowHours', 'rescheduleWindowHours'] as const) {
    if (body[key] !== undefined) {
      const value = Number(body[key])
      if (!Number.isFinite(value) || value < 0) {
        throw createError({ statusCode: 400, statusMessage: `${key} must be a non-negative number` })
      }
      data[key] = value
    }
  }

  if (data.openHour !== undefined && data.closeHour !== undefined && Number(data.openHour) >= Number(data.closeHour)) {
    throw createError({ statusCode: 400, statusMessage: 'openHour must be before closeHour' })
  }

  const updated = await prisma.club.update({
    where: { id: club.id },
    data,
  })

  return {
    id: updated.id,
    slug: updated.slug,
    nameFa: updated.nameFa,
    nameEn: updated.nameEn,
    city: updated.city,
    district: updated.district,
    addressFa: updated.addressFa,
    addressEn: updated.addressEn,
    phone: updated.phone,
    whatsapp: updated.whatsapp,
    image: updated.image,
    openHour: updated.openHour,
    closeHour: updated.closeHour,
    cancellationWindowHours: updated.cancellationWindowHours,
    rescheduleWindowHours: updated.rescheduleWindowHours,
    waitlistEnabled: updated.waitlistEnabled,
  }
})
