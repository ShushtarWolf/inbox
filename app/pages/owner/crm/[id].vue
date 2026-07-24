<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { formatNumber, formatCurrency, formatIsoDate } = useFormatters()
const id = route.params.id as string

const { data, pending, error } = await useAuthedFetch(`/api/owner/contacts/${id}`)

const contact = computed(() => data.value?.contact)
const recentCampaigns = computed(() => data.value?.recentCampaigns || [])

function campaignStatusLabel(status: string) {
  return t(`owner.crmPage.campaignStatus.${status}` as 'owner.crmPage.campaignStatus.SENT')
}
</script>

<template>
  <div class="venus-page-stack">
    <AppAsyncState :pending="pending" :error="error" :empty="!contact" skeleton-variant="default">
      <div v-if="contact" class="venus-page-stack">
        <section class="canva-dash-hero">
          <NuxtLink :to="localePath('/owner/crm')" class="inline-flex items-center gap-1.5 text-xs text-white/80">
            <AppIcon name="arrow_back" size="sm" />
            {{ t('owner.crm') }}
          </NuxtLink>
          <h1 class="mt-2 font-display text-2xl font-bold">{{ contact.name }}</h1>
          <p class="mt-1 text-sm text-white/85"><bdi dir="ltr" class="tabular-nums">{{ contact.mobile || '—' }}</bdi></p>
          <span
            class="mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
            :class="contact.consentSms ? 'bg-white/20 text-white' : 'bg-black/20 text-white/70'"
          >
            <AppIcon :name="contact.consentSms ? 'sms' : 'sms_failed'" size="sm" />
            {{ contact.consentSms ? t('owner.playerDetail.consentYes') : t('owner.playerDetail.consentNo') }}
          </span>
        </section>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="canva-panel">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.visits') }}</p>
            <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(contact.totalVisits || 0) }}</p>
          </div>
          <div class="canva-panel">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.ltv') }}</p>
            <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatCurrency(contact.lifetimeValue || 0) }}</p>
          </div>
          <div class="canva-panel">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.inactiveDays') }}</p>
            <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(contact.inactiveDays || 0) }}</p>
          </div>
          <div class="canva-panel">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.noShowCount') }}</p>
            <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatNumber(contact.noShowCount || 0) }}</p>
          </div>
          <div class="canva-panel col-span-2 sm:col-span-1">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.lastVisit') }}</p>
            <p class="mt-1 text-sm font-bold text-brand-navy"><bdi dir="ltr" class="tabular-nums">{{ contact.lastVisit ? formatIsoDate(contact.lastVisit) : '—' }}</bdi></p>
          </div>
        </div>

        <div class="canva-panel space-y-3">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.playerDetail.recentCampaigns') }}</h2>
          <CanvaEmptyState v-if="!recentCampaigns.length" :title="t('owner.crmPage.emptyCampaigns')" icon="campaign" />
          <div v-for="item in recentCampaigns" :key="item.id" class="canva-list-card">
            <div class="flex items-center justify-between gap-3">
              <p class="font-bold text-brand-navy">{{ item.campaign?.name || '—' }}</p>
              <span v-if="item.campaign?.status" class="neo-badge">{{ campaignStatusLabel(item.campaign.status) }}</span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-500"><bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(item.createdAt) }}</bdi></p>
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
