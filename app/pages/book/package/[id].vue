<script setup lang="ts">
/**
 * Court-booking MVP: athlete package book is off. Soft landing instead of crash.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-10">
    <h1 class="font-display text-xl font-bold">{{ t('booking.packageDisabled.title') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('booking.packageDisabled.body') }}</p>
    <NuxtLink :to="localePath('/clubs')" class="btn-primary inline-block">
      {{ t('booking.packageDisabled.cta') }}
    </NuxtLink>
  </div>
</template>
