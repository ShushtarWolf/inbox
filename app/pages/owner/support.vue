<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/settings')
const { data: smsStatus, refresh: refreshSmsStatus } = await useAuthedFetch('/api/owner/sms-status')
useOwnerClubRefresh(() => {
  refresh()
  refreshSmsStatus()
})

const liveSms = computed(() =>
  Boolean(smsStatus.value?.live || smsStatus.value?.resolvedProvider === 'live'),
)
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
      <h1 class="canva-page-hero-title">{{ t('owner.support') }}</h1>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="canva-panel">
        <h2 class="font-bold text-brand-navy">{{ t('owner.supportPage.operations') }}</h2>
        <div class="mt-3 space-y-2 text-sm text-brand-gray-600">
          <p>{{ t('owner.supportPage.calendarHelp') }}</p>
          <p>{{ t('owner.supportPage.paymentHelp') }}</p>
          <p>{{ liveSms ? t('owner.supportPage.crmHelpLive') : t('owner.supportPage.crmHelp') }}</p>
        </div>
      </div>

      <div class="canva-panel">
        <h2 class="font-bold text-brand-navy">{{ t('owner.supportPage.contactTitle') }}</h2>
        <div class="mt-3 space-y-2 text-sm">
          <p><span class="font-bold">{{ t('common.mobile') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data?.club?.phone || t('common.empty') }}</bdi></p>
          <p><span class="font-bold">{{ t('common.whatsapp') }}:</span> <bdi dir="ltr" class="tabular-nums">{{ data?.club?.whatsapp || t('common.empty') }}</bdi></p>
          <p class="text-brand-gray-600">{{ t('owner.supportPage.contactNote') }}</p>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
