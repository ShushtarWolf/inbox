<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { formatNumber, formatCurrency, formatIsoDate, formatPhone } = useFormatters()
const id = route.params.id as string

const { data, pending, error } = await useAuthedFetch<{
  contact?: {
    id: string
    name: string
    mobile?: string | null
    consentSms?: boolean
    totalVisits?: number | null
    lifetimeValue?: number | null
    inactiveDays?: number | null
    noShowCount?: number | null
    lastVisit?: string | null
  } | null
  recentCampaigns?: Array<{
    id: string
    createdAt?: string
    campaign?: { name?: string; status?: string } | null
  }>
}>(`/api/owner/contacts/${id}`)

const contact = computed(() => data.value?.contact)
const recentCampaigns = computed(() => data.value?.recentCampaigns || [])

function campaignStatusLabel(status: string) {
  return t(`owner.crmPage.campaignStatus.${status}` as 'owner.crmPage.campaignStatus.SENT')
}
</script>

<template>
  <div class="venus-page-stack">
    <NuxtLink :to="localePath('/owner/crm')" class="crm-back">← {{ t('owner.crm') }}</NuxtLink>
    <AppAsyncState :pending="pending" :error="error" :empty="!contact" skeleton-variant="default">
      <div v-if="contact" class="venus-page-stack">
        <div>
          <h1 class="crm-name">{{ contact.name }}</h1>
          <p class="crm-phone" dir="ltr"><bdi class="tabular-nums">{{ contact.mobile ? formatPhone(contact.mobile) : '—' }}</bdi></p>
          <span class="crm-consent" :class="contact.consentSms ? 'is-yes' : 'is-no'">
            {{ contact.consentSms ? t('owner.playerDetail.consentYes') : t('owner.playerDetail.consentNo') }}
          </span>
        </div>

        <div class="crm-stats">
          <div class="canva-panel crm-stat">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.visits') }}</p>
            <p class="crm-stat-v">{{ formatNumber(contact.totalVisits || 0) }}</p>
          </div>
          <div class="canva-panel crm-stat">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.ltv') }}</p>
            <p class="crm-stat-v">{{ formatCurrency(contact.lifetimeValue || 0) }}</p>
          </div>
          <div class="canva-panel crm-stat">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.inactiveDays') }}</p>
            <p class="crm-stat-v">{{ formatNumber(contact.inactiveDays || 0) }}</p>
          </div>
          <div class="canva-panel crm-stat">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.noShowCount') }}</p>
            <p class="crm-stat-v">{{ formatNumber(contact.noShowCount || 0) }}</p>
          </div>
          <div class="canva-panel crm-stat crm-stat-wide">
            <p class="text-xs text-brand-gray-500">{{ t('owner.playerDetail.lastVisit') }}</p>
            <p class="crm-stat-v"><bdi dir="auto">{{ contact.lastVisit || '—' }}</bdi></p>
          </div>
        </div>

        <div class="canva-panel space-y-3">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.playerDetail.recentCampaigns') }}</h2>
          <CanvaEmptyState v-if="!recentCampaigns.length" :title="t('owner.crmPage.emptyCampaigns')" icon="campaign" />
          <div v-for="item in recentCampaigns" :key="item.id" class="canva-list-card">
            <div class="flex items-center justify-between gap-3">
              <p class="font-bold text-brand-navy">{{ item.campaign?.name || '—' }}</p>
              <span v-if="item.campaign?.status" class="crm-consent is-yes !mb-0">{{ campaignStatusLabel(item.campaign.status) }}</span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-500"><bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(item.createdAt || '') }}</bdi></p>
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
/* SoT: design-reference/sot/inbox-all-pages.html #pg-owner-crm-detail (.adback, h1 26px, .cxp, .adtag.g) */
.crm-back { display: inline-block; align-self: flex-start; font-weight: 700; text-decoration: underline; font-size: 13px; color: #2c2c2a; }
.crm-name { font-size: 26px; font-weight: 700; margin: 6px 0 4px; color: #2c2c2a; text-align: start; }
.crm-phone { font-size: 13px; color: #4a4a47; margin: 6px 0 10px; text-align: right; }
.crm-consent { display: inline-block; font-size: 11px; padding: 3px 10px; font-weight: 700; }
.crm-consent.is-yes { background: #e6f6ee; color: #17603a; }
.crm-consent.is-no { background: #f1efe9; color: #6b6b67; }
/* SoT crmSt(): .cxbox padding 16, small #6b6b67 label, 20px bold value; 5 equal cols, gap 12 */
.crm-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.crm-stat { padding: 16px !important; }
.crm-stat > p:first-child { color: #6b6b67; font-size: 12px; }
.crm-stat-v { display: block; margin-top: 6px; font-size: 20px; font-weight: 700; color: #2c2c2a; }
/* Mobile: SoT crushes 5 cols into 375 (values wrap mid-number); keep 2 cols for readability */
@media (max-width: 640px) {
  .crm-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .crm-stat-wide { grid-column: span 2; }
  .crm-stat-v { font-size: 18px; }
}
</style>
