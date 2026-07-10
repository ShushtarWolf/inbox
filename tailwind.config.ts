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
        sans: ['Outfit Variable', 'Outfit', 'Vazirmatn Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['Outfit Variable', 'Outfit', 'Vazirmatn Variable', 'sans-serif'],
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
        ios: '0.75rem',
        'ios-lg': '1rem',
        venus: '0.75rem',
        'venus-lg': '1rem',
        'venus-xl': '1.25rem',
        tail: '0.75rem',
        'tail-lg': '1rem',
        'tail-xl': '1.25rem',
      },
      boxShadow: {
        card: '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
        glass: '0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
        venus: '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
        'venus-sm': '0px 1px 2px 0px rgba(16, 24, 40, 0.05)',
        'venus-focus': '0px 0px 0px 4px rgba(70, 95, 255, 0.12)',
        'tail-md': '0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
        'tail-lg': '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
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
        'tail-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'venus-shimmer': 'venus-shimmer 1.6s ease-in-out infinite',
        'venus-spin': 'venus-spin 0.8s linear infinite',
        'venus-fade-up': 'venus-fade-up 0.45s ease-out both',
        'venus-fade-in': 'venus-fade-in 0.35s ease-out both',
        'venus-scale-in': 'venus-scale-in 0.4s ease-out both',
        'venus-progress': 'venus-progress 1.2s ease-in-out infinite',
        'tail-pulse': 'tail-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
