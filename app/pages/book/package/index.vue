<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-[520px] space-y-4 px-4 py-10 text-start">
    <h1 class="text-[28px] font-bold text-brand-navy">{{ t('booking.packageDisabled.title') }}</h1>
    <p class="text-sm leading-relaxed text-brand-gray-600">{{ t('booking.packageDisabled.body') }}</p>
    <NuxtLink
      :to="localePath('/clubs')"
      class="canva-cta inline-flex min-h-11 items-center justify-center px-6 text-sm font-bold"
      style="border-radius: var(--sz-canva-radius);"
    >
      {{ t('booking.packageDisabled.cta') }}
    </NuxtLink>
  </div>
</template>
