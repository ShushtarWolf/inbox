/**
 * TailAdmin design tokens (https://demo.tailadmin.com/)
 */
export const palette = {
  brand: {
    primary: '#465FFF',
    primaryDark: '#3641F5',
    primaryLight: '#7592FF',
    primarySoft: '#ECF3FF',
    cream: '#F9FAFB',
    accent: '#0BA5EC',
    accentDark: '#3641F5',
    accentSoft: '#E0F2FE',
    lavender: '#F2F4F7',
    mint: '#12B76A',
    sky: '#36BFFA',
    white: '#FFFFFF',
    navy: '#101828',
    surface: ['#465FFF', '#0BA5EC', '#12B76A', '#F79009'] as const,
  },
  gray: {
    50: '#F9FAFB',
    100: '#F2F4F7',
    200: '#E4E7EC',
    300: '#D0D5DD',
    400: '#98A2B3',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1D2939',
    900: '#101828',
  },
  semantic: {
    success: '#12B76A',
    danger: '#F04438',
    warning: '#F79009',
    info: '#465FFF',
  },
  schedule: {
    platformBooking: '#465FFF',
    clubBooking: '#3641F5',
    openSlot: '#F2F4F7',
    class: '#36BFFA',
    blocked: '#98A2B3',
    match: '#12B76A',
    tournament: '#F79009',
    session: '#7592FF',
  },
  slotDisplay: {
    FREE: '#F2F4F7',
    RESERVED: '#465FFF',
    PUBLIC: '#36BFFA',
    TEAM: '#12B76A',
    PENDING: '#F79009',
    CANCELLED: '#D0D5DD',
    CLOSED: '#344054',
  },
} as const

export const BRAND_PRIMARY = palette.brand.primary
export const BRAND_ACCENT = palette.brand.accent
export const BRAND_CREAM = palette.brand.cream
