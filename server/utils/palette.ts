/**
 * inbox neo-brutalism palette — from brand color swatches.
 */
export const palette = {
  brand: {
    primary: '#F28B82',
    primaryDark: '#1A1A1A',
    primaryLight: '#F5A623',
    primarySoft: 'rgba(242, 139, 130, 0.18)',
    cream: '#E066FF',
    accent: '#F7CE46',
    accentDark: '#F5A623',
    accentSoft: 'rgba(247, 206, 70, 0.22)',
    lavender: '#C9A0DC',
    mint: '#66BB6A',
    sky: '#81D4FA',
    white: '#FFFFFF',
    surface: ['#F28B82', '#F7CE46', '#F5A623', '#66BB6A'] as const,
  },
  gray: {
    50: '#FAF0FF',
    100: '#F0D4FF',
    200: '#E8C8F8',
    300: '#C9A0DC',
    400: '#A080B8',
    500: '#7A6090',
    600: '#5A4568',
    700: '#3D2E48',
    800: '#2A2030',
    900: '#1A1A1A',
  },
  semantic: {
    success: '#66BB6A',
    danger: '#F28B82',
    warning: '#F5A623',
    info: '#81D4FA',
  },
  schedule: {
    platformBooking: '#F28B82',
    clubBooking: '#F5A623',
    openSlot: '#C9A0DC',
    class: '#F7CE46',
    blocked: '#A080B8',
    match: '#66BB6A',
    tournament: '#81D4FA',
    session: '#F5A623',
  },
  slotDisplay: {
    FREE: '#C9A0DC',
    RESERVED: '#F28B82',
    PUBLIC: '#F7CE46',
    TEAM: '#66BB6A',
    PENDING: '#F5A623',
    CANCELLED: '#A080B8',
    CLOSED: '#1A1A1A',
  },
} as const

export const BRAND_PRIMARY = palette.brand.primary
export const BRAND_ACCENT = palette.brand.accent
export const BRAND_CREAM = palette.brand.cream
