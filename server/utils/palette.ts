/**
 * inbox brand book — shushzerv palette
 * 55% cream · 25% gray · 17% coach red · 3% gold
 */
export const palette = {
  brand: {
    primary: '#C41E1E',
    primaryDark: '#4A1420',
    primaryLight: '#D63A3A',
    primarySoft: 'rgba(196, 30, 30, 0.10)',
    gold: '#B68A3B',
    goldDark: '#9A7530',
    goldSoft: 'rgba(182, 138, 59, 0.14)',
    cream: '#F4EFE9',
    accent: '#B68A3B',
    accentDark: '#9A7530',
    accentSoft: 'rgba(182, 138, 59, 0.14)',
    lavender: '#E8E6E2',
    mint: '#6B1F28',
    sky: '#B68A3B',
    white: '#FFFFFF',
    navy: '#2C2C2A',
    surface: ['#C41E1E', '#B68A3B', '#6B1F28', '#4A1420'] as const,
  },
  gray: {
    50: '#F4EFE9',
    100: '#E8E6E2',
    200: '#D4D2CE',
    300: '#C0BEBA',
    400: '#A3A39F',
    500: '#6B6B67',
    600: '#52524F',
    700: '#3D3D3A',
    800: '#2C2C2A',
    900: '#1A1A18',
  },
  semantic: {
    success: '#2E7D4F',
    danger: '#C41E1E',
    warning: '#B68A3B',
    info: '#6B1F28',
  },
  schedule: {
    platformBooking: '#C41E1E',
    clubBooking: '#4A1420',
    openSlot: '#E8E6E2',
    class: '#B68A3B',
    blocked: '#A3A39F',
    match: '#6B1F28',
    tournament: '#B68A3B',
    session: '#D63A3A',
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
