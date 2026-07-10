import type { Config } from 'tailwindcss'
import { palette } from './server/utils/palette'

export default {
  content: [
    './app/components/**/*.{vue,js,ts}',
    './app/layouts/**/*.vue',
    './app/pages/**/*.vue',
    './app/app.vue',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans Variable', 'DM Sans', 'Vazirmatn Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['DM Sans Variable', 'DM Sans', 'Vazirmatn Variable', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: palette.brand.primary,
          'primary-dark': palette.brand.primaryDark,
          'primary-light': palette.brand.primaryLight,
          'primary-soft': palette.brand.primarySoft,
          gold: palette.brand.accentDark,
          cream: palette.brand.cream,
          accent: palette.brand.accent,
          lavender: palette.brand.lavender,
          mint: palette.brand.mint,
          sky: palette.brand.sky,
          white: palette.brand.white,
          navy: palette.brand.navy,
          gray: palette.gray,
        },
      },
      borderRadius: {
        ios: '1.25rem',
        'ios-lg': '1.75rem',
        venus: '1.25rem',
        'venus-lg': '1.75rem',
        'venus-xl': '2.5rem',
      },
      boxShadow: {
        card: '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
        glass: '0 8px 32px rgba(112, 144, 176, 0.12)',
        venus: '14px 17px 40px 4px rgba(112, 144, 176, 0.08)',
        'venus-sm': '0 4px 18px rgba(112, 144, 176, 0.08)',
        'venus-focus': '0 0 0 3px rgba(67, 24, 255, 0.15)',
      },
      keyframes: {
        'venus-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'venus-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'venus-fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'venus-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'venus-scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'venus-progress': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'venus-shimmer': 'venus-shimmer 1.6s ease-in-out infinite',
        'venus-spin': 'venus-spin 0.8s linear infinite',
        'venus-fade-up': 'venus-fade-up 0.45s ease-out both',
        'venus-fade-in': 'venus-fade-in 0.35s ease-out both',
        'venus-scale-in': 'venus-scale-in 0.4s ease-out both',
        'venus-progress': 'venus-progress 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
