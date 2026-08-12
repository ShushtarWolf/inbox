<script setup lang="ts">
/**
 * Court-booking MVP: athlete package book is off. Soft landing instead of crash.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4">
    <CanvaSubpageHeader to="/clubs" :title="t('booking.packageDisabled.title')" />
    <p class="text-sm text-brand-gray-600">{{ t('booking.packageDisabled.body') }}</p>
    <NuxtLink
      :to="localePath('/clubs')"
      class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
      style="border-radius: var(--sz-canva-radius);"
    >
      {{ t('booking.packageDisabled.cta') }}
    </NuxtLink>
  </div>
</template>
