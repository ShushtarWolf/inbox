import type { EquipmentCategory } from '@prisma/client'

export type DefaultEquipmentItem = {
  nameFa: string
  nameEn: string
  category: EquipmentCategory
  price: number
  quantity: number
}

/** Standard padel/tennis catalog seeded for every club; owners can add more via + افزودن. */
export const DEFAULT_EQUIPMENT: readonly DefaultEquipmentItem[] = [
  { nameFa: 'راکت', nameEn: 'Racket', category: 'RENTAL', price: 0, quantity: 1 },
  { nameFa: 'سبد توپ', nameEn: 'Ball basket', category: 'RENTAL', price: 0, quantity: 1 },
  { nameFa: 'توپ', nameEn: 'Ball', category: 'RENTAL', price: 0, quantity: 1 },
  { nameFa: 'سبد توپ جمع‌کن', nameEn: 'Ball hopper', category: 'RENTAL', price: 0, quantity: 1 },
  { nameFa: 'شخص توپ جمع‌کن', nameEn: 'Ball boy', category: 'SERVICE', price: 0, quantity: 1 },
] as const

/** Legacy or manual labels that satisfy a default slot (avoid duplicate backfill). */
export const DEFAULT_EQUIPMENT_ALIASES: Partial<Record<string, readonly string[]>> = {
  'شخص توپ جمع‌کن': ['توپ جمع‌کن', 'توپ جمع کن', 'Ball kid', 'Ball boy'],
}

function normalizeLabel(value: string) {
  return value.trim().replace(/\u200c/g, '')
}

export function defaultEquipmentPresent(
  existing: Array<{ nameFa: string; nameEn: string }>,
  item: DefaultEquipmentItem,
) {
  const labels = new Set(
    existing.flatMap((row) => [normalizeLabel(row.nameFa), normalizeLabel(row.nameEn)]),
  )
  if (labels.has(normalizeLabel(item.nameFa)) || labels.has(normalizeLabel(item.nameEn))) {
    return true
  }
  const aliases = DEFAULT_EQUIPMENT_ALIASES[item.nameFa] ?? []
  return aliases.some((alias) => labels.has(normalizeLabel(alias)))
}

export function defaultEquipmentMissing(
  existing: Array<{ nameFa: string; nameEn: string }>,
): DefaultEquipmentItem[] {
  return DEFAULT_EQUIPMENT.filter((item) => !defaultEquipmentPresent(existing, item))
}
