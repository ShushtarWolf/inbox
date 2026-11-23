import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const activeClubBar = readFileSync(
  new URL('../app/components/OwnerActiveClubBar.vue', import.meta.url),
  'utf8',
)
const clubSwitcher = readFileSync(
  new URL('../app/components/OwnerClubSwitcher.vue', import.meta.url),
  'utf8',
)

describe('owner header club switcher (no duplicate add-club link)', () => {
  it('does not render add-club CTAs in OwnerActiveClubBar', () => {
    expect(activeClubBar).not.toContain('addClubCta')
    expect(activeClubBar).not.toContain('addClubPath')
  })

  it('does not render add-club CTAs in OwnerClubSwitcher', () => {
    expect(clubSwitcher).not.toContain('addClubCta')
    expect(clubSwitcher).not.toContain('addClubPath')
  })
})