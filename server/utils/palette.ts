/**
 * inbox brand tokens — from INBOX Brand Book.
 */
export const palette = {
  brand: {
    primary: '#C41E1E',
    primaryDark: '#4A1420',
    primaryLight: '#DE0202',
    primarySoft: 'rgba(196, 30, 30, 0.10)',
    cream: '#F4EFE9',
    accent: '#B68A3B',
    accentDark: '#9A7530',
    accentSoft: 'rgba(182, 138, 59, 0.14)',
    surface: ['#C41E1E', '#4A1420', '#DE0202', '#6B1F28'] as const,
  },
  gray: {
    50: '#F4EFE9',
    100: '#EDE9E4',
    200: '#E0E0DC',
    300: '#C4C4C0',
    400: '#A3A39F',
    500: '#858582',
    600: '#6B6B67',
    700: '#52524F',
    800: '#3D3D3A',
    900: '#2C2C2A',
  },
  semantic: {
    success: '#3D7A6A',
    danger: '#C41E1E',
    warning: '#B68A3B',
    info: '#4A1420',
  },
  schedule: {
    platformBooking: '#C41E1E',
    clubBooking: '#4A1420',
    openSlot: '#858582',
    class: '#C41E1E',
    blocked: '#A3A39F',
    match: '#4A1420',
    tournament: '#6B1F28',
    session: '#B68A3B',
  },
  slotDisplay: {
    FREE: '#E8E6E2',
    RESERVED: '#C41E1E',
    PUBLIC: '#B68A3B',
    TEAM: '#6B1F28',
    PENDING: '#4A1420',
    CANCELLED: '#A3A39F',
    CLOSED: '#52524F',
  },
} as const

export const BRAND_PRIMARY = palette.brand.primary
export const BRAND_ACCENT = palette.brand.accent
export const BRAND_CREAM = palette.brand.cream
