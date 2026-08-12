<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.reserveRedirect.title')" />
    <p class="text-sm text-brand-gray-600">{{ t('owner.reserveRedirect.body') }}</p>
    <NuxtLink
      :to="localePath('/owner/calendar')"
      class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
      style="border-radius: var(--sz-canva-radius);"
    >
      {{ t('owner.reserveRedirect.cta') }}
    </NuxtLink>
  </div>
</template>
