<script setup lang="ts">
/**
 * Court-booking MVP: package drafts are disabled (same kill switch as recurring reserve).
 * Keep route open so old bookmarks do not 500 — redirect copy only.
 */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="font-display text-xl font-bold">{{ t('owner.packagesDisabled.title') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('owner.packagesDisabled.body') }}</p>
    <NuxtLink :to="localePath('/owner')" class="btn-primary inline-block">
      {{ t('owner.packagesDisabled.cta') }}
    </NuxtLink>
  </div>
</template>
