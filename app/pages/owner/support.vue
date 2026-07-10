<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const localePath = useLocalePath()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/settings')
useOwnerClubRefresh(refresh)
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <PageHeaderNav :title="t('owner.support')" :home-to="localePath('/')" :back-to="localePath('/owner')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
    <div class="ios-card p-6">
      <h2 class="font-bold">{{ t('owner.supportPage.operations') }}</h2>
      <div class="mt-3 space-y-2 text-sm text-brand-gray-600">
        <p>{{ t('owner.supportPage.calendarHelp') }}</p>
        <p>{{ t('owner.supportPage.paymentHelp') }}</p>
        <p>{{ t('owner.supportPage.crmHelp') }}</p>
      </div>
    </div>

    <div class="ios-card p-6">
      <h2 class="font-bold">{{ t('owner.supportPage.contactTitle') }}</h2>
      <div class="mt-3 space-y-2 text-sm">
        <p><span class="font-bold">{{ t('common.mobile') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data?.club?.phone || t('common.empty') }}</bdi></p>
        <p><span class="font-bold">{{ t('common.whatsapp') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data?.club?.whatsapp || t('common.empty') }}</bdi></p>
        <p class="text-brand-gray-600">{{ t('owner.supportPage.contactNote') }}</p>
      </div>
    </div>
    </AppAsyncState>
  </div>
</template>
