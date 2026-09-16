<script setup lang="ts">
import { GEO_SPORT_HUBS } from '#shared/geoSportHubs.ts'

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <nav
    class="canva-help-hubs"
    :aria-label="t('clubs.hubs.discoveryLabel')"
  >
    <p class="canva-help-hubs-label">{{ t('clubs.hubs.discoveryLabel') }}</p>
    <div class="canva-clubs-chip-row">
      <NuxtLink
        v-for="hub in GEO_SPORT_HUBS"
        :key="hub.path"
        :to="localePath(hub.path)"
        class="canva-clubs-chip canva-clubs-chip-idle"
      >
        {{ t(`clubs.hubs.${hub.i18nKey}.h1`) }}
      </NuxtLink>
    </div>
  </nav>
</template>
