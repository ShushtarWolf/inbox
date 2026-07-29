import { describe, expect, it } from 'vitest'
import { resolveClubSlugAlias } from './clubSlugAliases'

describe('resolveClubSlugAlias', () => {
  it('maps legacy pilot slug to iust-tennis', () => {
    expect(resolveClubSlugAlias('club-9208f4')).toBe('iust-tennis')
  })

  it('passes through canonical and unknown slugs', () => {
    expect(resolveClubSlugAlias('iust-tennis')).toBe('iust-tennis')
    expect(resolveClubSlugAlias('some-other-club')).toBe('some-other-club')
  })
})
