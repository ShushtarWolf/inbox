import { fileURLToPath } from 'node:url'

const PWA_RESET_VERSION = '4'

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
      script: [
        {
          key: 'inbox-pwa-reset',
          type: 'text/javascript',
          tagPosition: 'head',
          children: `(function(){try{var v='${PWA_RESET_VERSION}';var k='inbox-sw-reset';if(localStorage.getItem(k)===v)return;localStorage.setItem(k,v);var reload=function(){location.reload()};var purge=function(){if(!('caches' in window))return Promise.resolve();return caches.keys().then(function(keys){return Promise.all(keys.map(function(key){return caches.delete(key)}))})};if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(reg){return reg.unregister()}))}).then(purge).then(reload).catch(reload)}else{purge().then(reload).catch(reload)}}catch(e){}})();`,
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.svg' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,-50..200' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#C41E1E' },
        { name: 'description', content: "inbox — every court's a box; your game's in the inbox." },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'inbox' },
        { name: 'mobile-web-app-capable', content: 'yes' },
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
    detectBrowserLanguage: false,
  },

  routeRules: {
    '/**': {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
    '/_nuxt/**': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
    '/api/**': {
      cors: true,
    },
  },

  pwa: {
    disable: process.env.NUXT_PUBLIC_ENABLE_PWA !== 'true',
    minify: false,
    registerType: 'autoUpdate',
    manifest: {
      id: '/',
      name: 'inbox — Sports Booking',
      short_name: 'inbox',
      description: "every court's a box; your game's in the inbox.",
      lang: 'fa',
      dir: 'rtl',
      theme_color: '#C41E1E',
      background_color: '#F4EFE9',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      categories: ['sports', 'lifestyle'],
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
      navigateFallbackDenylist: [/^\/api\//],
      globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
      globIgnores: ['**/videos/**', '**/planning/**'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      skipWaiting: true,
      clientsClaim: true,
    },
    client: {
      installPrompt: false,
      register: false,
    },
    devOptions: { enabled: process.env.NUXT_PUBLIC_ENABLE_PWA === 'true' },
  },

  nitro: {
    storage: {
      cache: { driver: 'memory' },
      ...(process.env.REDIS_URL
        ? { redis: { driver: 'redis', url: process.env.REDIS_URL } }
        : {}),
    },
  },

  runtimeConfig: {
    oauth: {
      google: {
        clientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET || '',
        redirectURL: process.env.NUXT_OAUTH_GOOGLE_REDIRECT_URL || '',
      },
    },
    public: {
      enablePwa: process.env.NUXT_PUBLIC_ENABLE_PWA === 'true',
      paymentsMode: process.env.PAYMENTS_MODE || 'pay_at_club',
      sentryDsn: process.env.SENTRY_DSN || '',
      sentryEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
      sentryRelease: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '',
    },
    session: {
      name: 'inbox-session',
      password: process.env.NUXT_SESSION_PASSWORD || 'inbox-demo-session-password-change-me',
    },
  },
})
