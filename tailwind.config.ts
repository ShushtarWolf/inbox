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
          gold: palette.brand.accentDark,
          cream: palette.brand.cream,
          accent: palette.brand.accent,
          lavender: palette.brand.lavender,
          mint: palette.brand.mint,
          sky: palette.brand.sky,
          white: palette.brand.white,
          gray: palette.gray,
        },
      },
      borderRadius: {
        ios: '0.25rem',
        'ios-lg': '0.375rem',
        brutal: '0.25rem',
      },
      boxShadow: {
        card: '4px 4px 0 0 #000',
        glass: '2px 2px 0 0 #000',
        brutal: '4px 4px 0 0 #000',
        'brutal-sm': '2px 2px 0 0 #000',
        'brutal-lg': '6px 6px 0 0 #000',
      },
      borderWidth: {
        brutal: '2px',
        'brutal-thick': '3px',
      },
    },
  },
  plugins: [],
} satisfies Config
