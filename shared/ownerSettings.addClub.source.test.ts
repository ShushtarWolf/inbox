import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const settingsPage = readFileSync(
  new URL('../app/pages/owner/settings.vue', import.meta.url),
  'utf8',
)
const clubSwitcher = readFileSync(
  new URL('../app/composables/useOwnerClubSwitcher.ts', import.meta.url),
  'utf8',
)

describe('owner settings add-club CTA (IB-54)', () => {
  it('opens the in-page add-club modal, not public signup', () => {
    expect(settingsPage).toContain('addClubOpen')
    expect(settingsPage).toContain('OwnerAddClubForm')
    expect(settingsPage).not.toContain("localePath('/register/owner')")
    expect(settingsPage).not.toContain('localePath("/register/owner")')
    expect(settingsPage).not.toContain(':to="addClubPath"')
  })

  it('keeps add-club path on /owner/clubs/new for session-backed creation', () => {
    expect(clubSwitcher).toContain("localePath('/owner/clubs/new')")
  })
})