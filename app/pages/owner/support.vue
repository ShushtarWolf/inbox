<script setup lang="ts">
/** Canva home page (29): ops guide + club contact — no soft TailAdmin cards. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/settings')
const { data: smsStatus, refresh: refreshSmsStatus } = await useAuthedFetch('/api/owner/sms-status')
useOwnerClubRefresh(() => {
  refresh()
  refreshSmsStatus()
})

const liveSms = computed(() =>
  smsStatus.value?.smsMode === 'live'
  && smsStatus.value?.smsPhase === 'MULTI'
  && Boolean(smsStatus.value?.multiReady),
)
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.support')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <section class="space-y-3 text-start">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.operations') }}</h2>
        <ul class="list-disc space-y-2 pe-4 text-sm text-brand-navy marker:text-brand-gray-400">
          <li>{{ t('owner.supportPage.calendarHelp') }}</li>
          <li>{{ t('owner.supportPage.paymentHelp') }}</li>
          <li>{{ liveSms ? t('owner.supportPage.crmHelpLive') : t('owner.supportPage.crmHelp') }}</li>
        </ul>
      </section>

      <section class="space-y-2 text-start">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.contactTitle') }}</h2>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.mobile') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.phone || t('common.empty') }}</bdi>
        </p>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.whatsapp') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.whatsapp || t('common.empty') }}</bdi>
        </p>
        <p class="text-xs text-brand-gray-500">{{ t('owner.supportPage.contactNote') }}</p>
      </section>
    </AppAsyncState>
  </div>
</template>
