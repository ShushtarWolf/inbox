import { existsSync } from 'node:fs'
import { defineNuxtModule, createResolver, addServerScanDir, addComponentsDir } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'inbox-external-calendar',
    configKey: 'inboxExternalCalendar',
  },
  defaults: {
    enabled: true,
  },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const moduleRoot = resolver.resolve('.')

    if (!existsSync(moduleRoot)) return

    nuxt.options.alias['#inbox-external-calendar'] = moduleRoot
    nuxt.options.css.push(resolver.resolve('./runtime/assets/external-suspected.css'))

    nuxt.options.runtimeConfig.public.externalCalendarModule = true

    addServerScanDir(resolver.resolve('./runtime/server'))

    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      pathPrefix: false,
    })

    nuxt.hook('pages:extend', (pages) => {
      pages.push(
        {
          name: 'owner-calendar-sources',
          path: '/owner/calendar-sources',
          file: resolver.resolve('./runtime/pages/owner/calendar-sources.vue'),
        },
        {
          name: 'admin-calendar-sources',
          path: '/admin/calendar-sources',
          file: resolver.resolve('./runtime/pages/admin/calendar-sources.vue'),
        },
      )
    })
  },
})
