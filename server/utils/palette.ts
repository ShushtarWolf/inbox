/**
 * Venus Dashboard Builder 2021 design tokens.
 */
export const palette = {
  brand: {
    primary: '#4318FF',
    primaryDark: '#1B2559',
    primaryLight: '#868CFF',
    primarySoft: 'rgba(67, 24, 255, 0.08)',
    cream: '#F4F7FE',
    accent: '#6AD2FF',
    accentDark: '#3965FF',
    accentSoft: 'rgba(106, 210, 255, 0.16)',
    lavender: '#E9EDF7',
    mint: '#01B574',
    sky: '#6AD2FF',
    white: '#FFFFFF',
    navy: '#2B3674',
    surface: ['#4318FF', '#6AD2FF', '#01B574', '#FFB547'] as const,
  },
  gray: {
    50: '#F4F7FE',
    100: '#E9EDF7',
    200: '#E0E5F2',
    300: '#C7D0E8',
    400: '#A3AED0',
    500: '#8F9BBA',
    600: '#707EAE',
    700: '#4A5568',
    800: '#2B3674',
    900: '#1B2559',
  },
  semantic: {
    success: '#01B574',
    danger: '#EE5D50',
    warning: '#FFB547',
    info: '#3965FF',
  },
  schedule: {
    platformBooking: '#4318FF',
    clubBooking: '#3965FF',
    openSlot: '#E9EDF7',
    class: '#6AD2FF',
    blocked: '#A3AED0',
    match: '#01B574',
    tournament: '#FFB547',
    session: '#868CFF',
  },
  slotDisplay: {
    FREE: '#E9EDF7',
    RESERVED: '#4318FF',
    PUBLIC: '#6AD2FF',
    TEAM: '#01B574',
    PENDING: '#FFB547',
    CANCELLED: '#A3AED0',
    CLOSED: '#2B3674',
  },
} as const

export const BRAND_PRIMARY = palette.brand.primary
export const BRAND_ACCENT = palette.brand.accent
export const BRAND_CREAM = palette.brand.cream
