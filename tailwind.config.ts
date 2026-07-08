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
        sans: ['Manrope Variable', 'Manrope', 'Vazirmatn Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk Variable', 'Space Grotesk', 'Manrope Variable', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: palette.brand.primary,
          'primary-dark': palette.brand.primaryDark,
          'primary-light': palette.brand.primaryLight,
          gold: palette.brand.accent,
          cream: palette.brand.cream,
          gray: palette.gray,
        },
      },
      borderRadius: {
        ios: '1.25rem',
        'ios-lg': '1.75rem',
      },
      boxShadow: {
        card: '0 2px 16px rgba(0, 0, 0, 0.06)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config
