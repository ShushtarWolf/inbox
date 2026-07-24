<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="font-display text-xl font-bold">{{ t('owner.reserveRedirect.title') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('owner.reserveRedirect.body') }}</p>
    <NuxtLink :to="localePath('/owner/calendar')" class="btn-primary inline-block">
      {{ t('owner.reserveRedirect.cta') }}
    </NuxtLink>
  </div>
</template>
