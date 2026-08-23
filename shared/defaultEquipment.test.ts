import { describe, expect, it } from 'vitest'
import { defaultEquipmentMissing, DEFAULT_EQUIPMENT } from './defaultEquipment'

describe('defaultEquipmentMissing', () => {
  it('returns all defaults for an empty club', () => {
    expect(defaultEquipmentMissing([])).toEqual([...DEFAULT_EQUIPMENT])
  })

  it('skips items already present by Persian name', () => {
    expect(defaultEquipmentMissing([{ nameFa: 'راکت', nameEn: 'Racket' }]).map((i) => i.nameFa)).toEqual([
      'سبد توپ',
      'توپ',
      'سبد توپ جمع‌کن',
      'شخص توپ جمع‌کن',
    ])
  })

  it('treats توپ جمع‌کن as شخص توپ جمع‌کن', () => {
    const missing = defaultEquipmentMissing([{ nameFa: 'توپ جمع‌کن', nameEn: 'Ball kid' }])
    expect(missing.some((i) => i.nameFa === 'شخص توپ جمع‌کن')).toBe(false)
  })
})
