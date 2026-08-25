import { existsSync } from 'node:fs'
import { defineNuxtModule, createResolver, addServerScanDir } from '@nuxt/kit'

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

    addServerScanDir(resolver.resolve('./runtime/server'))

    nuxt.hook('pages:extend', (pages) => {
      pages.push({
        name: 'owner-calendar-sources',
        path: '/owner/calendar-sources',
        file: resolver.resolve('./runtime/pages/owner/calendar-sources.vue'),
      })
    })
  },
})
