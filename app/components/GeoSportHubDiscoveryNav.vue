<script setup lang="ts">
import { GEO_SPORT_HUBS } from '#shared/geoSportHubs.ts'

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <nav
    class="space-y-2 border border-brand-gray-200 bg-white p-3"
    style="border-radius: var(--sz-canva-radius);"
    :aria-label="t('clubs.hubs.discoveryLabel')"
  >
    <p class="text-start text-xs font-bold text-brand-gray-600">{{ t('clubs.hubs.discoveryLabel') }}</p>
    <div class="flex flex-col gap-2">
      <NuxtLink
        v-for="hub in GEO_SPORT_HUBS"
        :key="hub.path"
        :to="localePath(hub.path)"
        class="text-start text-sm font-bold text-brand-navy underline-offset-2 hover:underline"
      >
        {{ t(`clubs.hubs.${hub.i18nKey}.h1`) }}
      </NuxtLink>
    </div>
  </nav>
</template>
