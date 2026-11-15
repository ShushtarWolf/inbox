import { describe, expect, it } from 'vitest'
import { PUBLIC_CLUB_DIRECTORY_WHERE } from './clubDirectory.ts'

describe('PUBLIC_CLUB_DIRECTORY_WHERE', () => {
  it('requires active and listed clubs', () => {
    expect(PUBLIC_CLUB_DIRECTORY_WHERE).toEqual({
      status: 'ACTIVE',
      isUnlisted: false,
    })
  })
})