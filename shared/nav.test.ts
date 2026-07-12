import { describe, expect, it } from 'vitest'
import { isNavItemActive, type NavItem } from './nav'

const ownerNav: NavItem[] = [
  { to: '/owner', label: 'Calendar' },
  { to: '/owner/finance', label: 'Finance' },
  { to: '/owner/crm', label: 'CRM' },
]

const athleteNav: NavItem[] = [
  { to: '/athlete', label: 'Home' },
  { to: '/athlete/bookings', label: 'Bookings' },
  { to: '/athlete/profile', label: 'Profile' },
]

describe('isNavItemActive', () => {
  it('marks exact path active when no child nav exists', () => {
    const single: NavItem[] = [{ to: '/coach', label: 'Coach' }]
    expect(isNavItemActive('/coach', '/coach', single)).toBe(true)
    expect(isNavItemActive('/coach/schedule', '/coach', single)).toBe(true)
  })

  it('does not mark parent active when child nav items exist', () => {
    expect(isNavItemActive('/owner/finance', '/owner', ownerNav)).toBe(false)
    expect(isNavItemActive('/owner/finance', '/owner/finance', ownerNav)).toBe(true)
    expect(isNavItemActive('/owner', '/owner', ownerNav)).toBe(true)
  })

  it('marks booking detail under bookings nav', () => {
    expect(isNavItemActive('/athlete/bookings/abc', '/athlete', athleteNav)).toBe(false)
    expect(isNavItemActive('/athlete/bookings/abc', '/athlete/bookings', athleteNav)).toBe(true)
  })
})
