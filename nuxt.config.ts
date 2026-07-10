import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-06-02',
  devtools: { enabled: false },

  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/i18n',
    'nuxt-auth-utils',
    '@vite-pwa/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'inbox',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.svg' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,-50..200' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#465FFF' },
        { name: 'description', content: "inbox — every court's a box; your game's in the inbox." },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'inbox' },
      ],
    },
  },

  i18n: {
    restructureDir: false,
    bundle: { optimizeTranslationDirective: false },
    locales: [
      { code: 'fa', language: 'fa-IR', name: 'فارسی', dir: 'rtl', file: 'fa.json' },
      { code: 'en', language: 'en-US', name: 'English', dir: 'ltr', file: 'en.json' },
    ],
    defaultLocale: 'fa',
    strategy: 'prefix_except_default',
    lazy: true,
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'inbox_locale',
      redirectOn: 'root',
    },
  },

  pwa: {
    disable: process.env.NUXT_PUBLIC_ENABLE_PWA === 'true' ? false : true,
    minify: false,
    registerType: 'autoUpdate',
    manifest: {
      name: 'inbox — Sports Booking',
      short_name: 'inbox',
      description: "every court's a box; your game's in the inbox.",
      lang: 'fa',
      dir: 'rtl',
      theme_color: '#465FFF',
      background_color: '#F9FAFB',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      navigateFallback: '/offline',
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      globIgnores: ['**/videos/**', '**/planning/**'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    },
    client: {
      installPrompt: true,
      register: false,
    },
    devOptions: { enabled: false },
  },

  runtimeConfig: {
    session: {
      name: 'inbox-session',
      password: process.env.NUXT_SESSION_PASSWORD || 'inbox-demo-session-password-change-me',
    },
  },
})
