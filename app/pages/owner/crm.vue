<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { formatHours } = useFormatters()
const selectedSegment = ref('all')
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/contacts', {
  query: computed(() => ({ segment: selectedSegment.value === 'all' ? undefined : selectedSegment.value })),
})
useOwnerClubRefresh(refresh)
const sms = reactive({ message: '', recipient: 'all', campaignName: '', schedule: '' })
const feedback = ref('')

const builtInSegments = new Set(['all', 'vip', 'inactive', 'atRisk'])

function segmentLabel(segment: { id: string, name: string }) {
  if (builtInSegments.has(segment.id)) {
    return t(`owner.crmPage.segments.${segment.id}` as 'owner.crmPage.segments.all')
  }
  return segment.name
}

function campaignStatusLabel(status: string) {
  return t(`owner.crmPage.campaignStatus.${status}` as 'owner.crmPage.campaignStatus.SENT')
}

function triggerTypeLabel(type: string) {
  return t(`owner.crmPage.triggerType.${type}` as 'owner.crmPage.triggerType.booking_upcoming')
}

async function send() {
  await $fetch('/api/owner/sms', {
    method: 'POST',
    body: {
      ...sms,
      segmentName: data.value?.segments?.find((item: { id: string }) => item.id === selectedSegment.value)?.name,
    },
  })
  feedback.value = t('owner.crmPage.smsLogged')
  refresh()
}
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
    <AppVenusSkeleton v-if="pending" :lines="3" />
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <template v-else>
    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div class="ios-card p-3 text-center">
          <p class="text-lg font-black text-brand-primary">{{ data?.stats?.totalContacts || 0 }}</p>
          <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.stats.contacts') }}</p>
        </div>
        <div class="ios-card p-3 text-center">
          <p class="text-lg font-black text-brand-primary">{{ data?.stats?.activeThisMonth || 0 }}</p>
          <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.stats.activeThisMonth') }}</p>
        </div>
        <div class="ios-card p-3 text-center">
          <p class="text-lg font-black text-brand-primary">{{ data?.stats?.smsSent || 0 }}</p>
          <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.stats.smsSent') }}</p>
        </div>
        <div class="ios-card p-3 text-center">
          <p class="text-lg font-black text-brand-primary">{{ data?.stats?.campaigns || 0 }}</p>
          <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.stats.campaigns') }}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="segment in data?.segments"
          :key="segment.id"
          type="button"
          class="neo-pill neo-pill-inactive"
          :class="selectedSegment === segment.id ? 'neo-pill-active shadow-brutal' : ''"
          @click="selectedSegment = segment.id"
        >
          {{ segmentLabel(segment) }} ({{ segment.count }})
        </button>
      </div>

      <div class="ios-card p-4">
        <h1 class="mb-3 font-bold">{{ $t('owner.crm') }}</h1>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[30rem] text-sm">
            <thead><tr class="text-brand-gray-600"><th class="p-2">{{ t('owner.crmPage.name') }}</th><th class="p-2">{{ t('owner.crmPage.mobile') }}</th></tr></thead>
            <tbody>
              <tr v-for="c in data?.contacts" :key="c.id" class="border-t">
                <td class="p-2">
                  <p class="font-bold">{{ c.name }}</p>
                  <p class="text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ c.lastVisit }}</bdi> · {{ t('owner.crmPage.visitCount', { count: c.totalVisits }) }}</p>
                </td>
                <td class="p-2">
                  <p><bdi dir="ltr" class="tabular-nums">{{ c.mobile }}</bdi></p>
                  <p class="text-xs text-brand-gray-600">{{ c.lifetimeValue }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ios-card p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.crmPage.recentCampaigns') }}</h2>
        <div class="space-y-2 text-sm">
          <div v-for="campaign in data?.campaigns" :key="campaign.id" class="ios-card p-3">
            <div class="flex items-center justify-between gap-3">
              <p class="font-bold">{{ campaign.name }}</p>
              <span class="text-xs text-brand-gray-600">{{ campaignStatusLabel(campaign.status) }}</span>
            </div>
            <p class="text-xs text-brand-gray-600">{{ campaign.segmentName || t('owner.crmPage.allRecipients') }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.delivered', { delivered: campaign.delivered, total: campaign.total }) }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div class="ios-card p-4">
        <h2 class="mb-2 font-bold">{{ t('owner.crmPage.pushSms') }}</h2>
        <p class="mb-2 text-sm text-brand-gray-600">{{ t('owner.crmPage.logOnlyNote') }}</p>
        <input v-model="sms.campaignName" :placeholder="t('owner.crmPage.campaignName')" class="mb-2 neo-input" />
        <select v-model="sms.recipient" class="mb-2 neo-input">
          <option value="all">{{ t('owner.crmPage.allRecipients') }}</option>
          <option value="vip">{{ t('owner.crmPage.vip') }}</option>
          <option value="inactive">{{ t('owner.crmPage.reactivation') }}</option>
          <option value="atRisk">{{ t('owner.crmPage.noShowRisk') }}</option>
        </select>
        <input v-model="sms.schedule" type="datetime-local" dir="ltr" class="mb-2 neo-input tabular-nums">
        <textarea v-model="sms.message" class="mb-2 neo-input" rows="4" />
        <button type="button" class="btn-primary" @click="send">{{ t('common.send') }}</button>
        <p v-if="feedback" class="mt-2 text-sm text-brand-gray-600">{{ feedback }}</p>
      </div>

      <div class="ios-card p-4">
        <h2 class="mb-2 font-bold">{{ t('owner.crmPage.reminders') }}</h2>
        <p class="mb-2 text-sm text-brand-gray-600">{{ t('owner.crmPage.remindersInfo') }}</p>
        <div class="space-y-2 text-sm">
          <div v-for="rule in data?.reminders" :key="rule.id" class="neo-select">
            <p class="font-bold">{{ rule.name }}</p>
            <p class="text-xs text-brand-gray-600">{{ triggerTypeLabel(rule.triggerType) }} · {{ formatHours(rule.offsetHours) }}</p>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
