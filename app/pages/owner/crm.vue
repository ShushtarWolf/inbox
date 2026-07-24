<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { formatHours } = useFormatters()
const selectedSegment = ref('all')
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/contacts', {
  query: computed(() => ({ segment: selectedSegment.value === 'all' ? undefined : selectedSegment.value })),
})
const { data: smsStatus, refresh: refreshSmsStatus } = await useAuthedFetch('/api/owner/sms-status')
useOwnerClubRefresh(() => {
  refresh()
  refreshSmsStatus()
})
const sms = reactive({ message: '', recipient: 'all', campaignName: '', schedule: '' })
const feedback = ref('')

const liveSms = computed(() =>
  Boolean(smsStatus.value?.live || smsStatus.value?.resolvedProvider === 'live' || data.value?.sms?.live),
)

const builtInSegments = new Set(['all', 'vip', 'inactive', 'atRisk'])

function segmentLabel(segment: { id: string, name: string }) {
  if (builtInSegments.has(segment.id)) {
    return t(`owner.crmPage.segments.${segment.id}` as 'owner.crmPage.segments.all')
  }
  return segment.name
}

function campaignStatusLabel(status: string) {
  // Pipeline status SENT after dry-run must not read as phone delivery.
  if (status === 'SENT' && !liveSms.value) {
    return t('owner.crmPage.campaignStatus.LOGGED')
  }
  return t(`owner.crmPage.campaignStatus.${status}` as 'owner.crmPage.campaignStatus.SENT')
}

function triggerTypeLabel(type: string) {
  return t(`owner.crmPage.triggerType.${type}` as 'owner.crmPage.triggerType.booking_upcoming')
}

function campaignResultLabel(campaign: {
  sent?: number
  logged?: number
  queued?: number
  delivered?: number
  total: number
}) {
  const sent = campaign.sent ?? 0
  const logged = campaign.logged ?? 0
  const queued = campaign.queued ?? 0
  const total = campaign.total
  // Never claim live delivery for logged-only recipients.
  if (sent > 0 || queued > 0) {
    return t('owner.crmPage.sent', { sent: sent + queued, total })
  }
  return t('owner.crmPage.logged', { logged: logged || campaign.delivered || 0, total })
}

async function send() {
  feedback.value = ''
  try {
    const result = await $fetch<{
      log?: { sent?: boolean, logged?: boolean }
      provider?: string
      campaign?: { status?: string }
    }>('/api/owner/sms', {
      method: 'POST',
      body: {
        ...sms,
        segmentName: data.value?.segments?.find((item: { id: string }) => item.id === selectedSegment.value)?.name,
      },
    })
    if (result.campaign?.status === 'SCHEDULED') {
      feedback.value = t('owner.crmPage.smsScheduled')
    } else if (result.log?.sent) {
      feedback.value = t('owner.crmPage.smsSentFeedback')
    } else if (result.log?.logged) {
      feedback.value = t('owner.crmPage.smsLogged')
    } else {
      // Fail closed: do not claim a live send without provider confirmation.
      feedback.value = t('owner.crmPage.smsLogged')
    }
    refresh()
    refreshSmsStatus()
  } catch {
    feedback.value = t('owner.crmPage.smsFailed')
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <section class="canva-dash-hero">
        <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
        <h1 class="canva-page-hero-title">{{ t('owner.crm') }}</h1>
        <p class="mt-1 text-sm text-white/85">
          {{ liveSms ? t('owner.crmPage.liveNote') : t('owner.crmPage.logOnlyNote') }}
        </p>
      </section>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="canva-panel">
          <p class="text-xs text-brand-gray-500">{{ t('owner.crmPage.stats.contacts') }}</p>
          <p class="mt-1 text-xl font-bold text-brand-navy">{{ data?.stats?.totalContacts || 0 }}</p>
        </div>
        <div class="canva-panel">
          <p class="text-xs text-brand-gray-500">{{ t('owner.crmPage.stats.activeThisMonth') }}</p>
          <p class="mt-1 text-xl font-bold text-brand-navy">{{ data?.stats?.activeThisMonth || 0 }}</p>
        </div>
        <div class="canva-panel">
          <p class="text-xs text-brand-gray-500">{{ liveSms ? t('owner.crmPage.stats.smsSentLive') : t('owner.crmPage.stats.smsSent') }}</p>
          <p class="mt-1 text-xl font-bold text-brand-navy">{{ data?.stats?.smsSent || 0 }}</p>
        </div>
        <div class="canva-panel">
          <p class="text-xs text-brand-gray-500">{{ t('owner.crmPage.stats.campaigns') }}</p>
          <p class="mt-1 text-xl font-bold text-brand-navy">{{ data?.stats?.campaigns || 0 }}</p>
        </div>
      </div>

      <div class="canva-rail gap-2">
        <button
          v-for="segment in data?.segments || []"
          :key="segment.id"
          type="button"
          class="canva-court-chip"
          :class="selectedSegment === segment.id ? 'canva-court-chip-active' : 'canva-court-chip-idle'"
          @click="selectedSegment = segment.id"
        >
          {{ segmentLabel(segment) }} ({{ segment.count }})
        </button>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div class="space-y-4">
          <div class="canva-panel space-y-2">
            <h2 class="text-base font-bold text-brand-navy">{{ $t('owner.crm') }}</h2>
            <div v-if="!(data?.contacts?.length)" class="rounded-xl border border-dashed border-brand-gray-200 px-3 py-8 text-center text-sm text-brand-gray-500">
              {{ t('owner.crmPage.emptyContacts') }}
            </div>
            <div
              v-for="c in data?.contacts || []"
              :key="c.id"
              class="canva-list-card"
            >
              <p class="font-bold text-brand-navy">{{ c.name }}</p>
              <p class="mt-1 text-sm text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ c.mobile || '—' }}</bdi></p>
              <p class="mt-1 text-xs text-brand-gray-500"><bdi dir="ltr" class="tabular-nums">{{ c.lastVisit || '—' }}</bdi> · {{ t('owner.crmPage.visitCount', { count: c.totalVisits || 0 }) }} · {{ c.lifetimeValue }}</p>
            </div>
          </div>

          <div class="canva-panel space-y-3">
            <h2 class="text-base font-bold text-brand-navy">{{ t('owner.crmPage.recentCampaigns') }}</h2>
            <p v-if="!(data?.campaigns?.length)" class="text-sm text-brand-gray-500">{{ t('owner.crmPage.emptyCampaigns') }}</p>
            <div v-for="campaign in data?.campaigns || []" :key="campaign.id" class="canva-list-card">
              <div class="flex items-center justify-between gap-3">
                <p class="font-bold text-brand-navy">{{ campaign.name }}</p>
                <span class="neo-badge">{{ campaignStatusLabel(campaign.status) }}</span>
              </div>
              <p class="mt-1 text-xs text-brand-gray-500">{{ campaign.segmentName || t('owner.crmPage.allRecipients') }}</p>
              <p class="text-xs text-brand-gray-500">{{ campaignResultLabel(campaign) }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="canva-panel">
            <h2 class="text-base font-bold text-brand-navy">{{ t('owner.crmPage.pushSms') }}</h2>
            <p class="mb-4 mt-1 text-sm text-brand-gray-500">
              {{ liveSms ? t('owner.crmPage.liveNote') : t('owner.crmPage.logOnlyNote') }}
            </p>
            <div class="venus-form-stack">
              <input v-model="sms.campaignName" :placeholder="t('owner.crmPage.campaignName')" class="neo-input" />
              <select v-model="sms.recipient" class="neo-select">
                <option value="all">{{ t('owner.crmPage.allRecipients') }}</option>
                <option value="vip">{{ t('owner.crmPage.vip') }}</option>
                <option value="inactive">{{ t('owner.crmPage.reactivation') }}</option>
                <option value="atRisk">{{ t('owner.crmPage.noShowRisk') }}</option>
              </select>
              <input v-model="sms.schedule" type="datetime-local" dir="ltr" class="neo-input tabular-nums">
              <textarea v-model="sms.message" class="neo-input min-h-24" rows="4" />
              <button type="button" class="btn-primary" @click="send">{{ t('common.send') }}</button>
              <p v-if="feedback" class="canva-flash-success">{{ feedback }}</p>
            </div>
          </div>

          <div class="canva-panel space-y-3">
            <h2 class="text-base font-bold text-brand-navy">{{ t('owner.crmPage.reminders') }}</h2>
            <p class="text-sm text-brand-gray-500">{{ t('owner.crmPage.remindersInfo') }}</p>
            <p v-if="!(data?.reminders?.length)" class="text-sm text-brand-gray-500">{{ t('owner.crmPage.emptyReminders') }}</p>
            <div v-for="rule in data?.reminders || []" :key="rule.id" class="canva-list-card">
              <p class="font-bold text-brand-navy">{{ rule.name }}</p>
              <p class="mt-1 text-xs text-brand-gray-500">{{ triggerTypeLabel(rule.triggerType) }} · {{ formatHours(rule.offsetHours) }}</p>
            </div>
          </div>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
