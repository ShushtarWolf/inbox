<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const { t } = useI18n()
const { formatHours } = useFormatters()
const selectedSegment = ref('all')
const { data, refresh } = await useAuthedFetch('/api/owner/contacts', {
  query: computed(() => ({ segment: selectedSegment.value === 'all' ? undefined : selectedSegment.value })),
})
useOwnerClubRefresh(refresh)
const sms = reactive({ message: '', recipient: 'all', campaignName: '', schedule: '' })
const feedback = ref('')

async function send() {
  const response = await $fetch('/api/owner/sms', {
    method: 'POST',
    body: {
      ...sms,
      segmentName: data.value?.segments?.find((item: { id: string }) => item.id === selectedSegment.value)?.name,
    },
  })
  feedback.value = response.note || t('owner.crmPage.smsLogged')
  refresh()
}
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="segment in data?.segments"
          :key="segment.id"
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-bold"
          :class="selectedSegment === segment.id ? 'border-brand-primary text-brand-primary' : ''"
          @click="selectedSegment = segment.id"
        >
          {{ segment.name }} ({{ segment.count }})
        </button>
      </div>

      <div class="rounded-xl border bg-white p-4">
        <h1 class="mb-3 font-bold">{{ $t('owner.crm') }}</h1>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[30rem] text-sm">
            <thead><tr class="text-brand-gray-600"><th class="p-2">{{ t('owner.crmPage.name') }}</th><th class="p-2">{{ t('owner.crmPage.mobile') }}</th></tr></thead>
            <tbody>
              <tr v-for="c in data?.contacts" :key="c.id" class="border-t">
                <td class="p-2">
                  <p class="font-bold">{{ c.name }}</p>
                  <p class="text-xs text-brand-gray-600">{{ c.lastVisit }} · {{ c.totalVisits }}x</p>
                </td>
                <td class="p-2">
                  <p>{{ c.mobile }}</p>
                  <p class="text-xs text-brand-gray-600">{{ c.lifetimeValue }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.crmPage.recentCampaigns') }}</h2>
        <div class="space-y-2 text-sm">
          <div v-for="campaign in data?.campaigns" :key="campaign.id" class="rounded-xl border p-3">
            <div class="flex items-center justify-between gap-3">
              <p class="font-bold">{{ campaign.name }}</p>
              <span class="text-xs text-brand-gray-600">{{ campaign.status }}</span>
            </div>
            <p class="text-xs text-brand-gray-600">{{ campaign.segmentName || t('owner.crmPage.allRecipients') }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.crmPage.delivered', { delivered: campaign.delivered, total: campaign.total }) }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-2 font-bold">{{ t('owner.crmPage.pushSms') }}</h2>
        <p class="mb-2 text-sm text-brand-gray-600">{{ t('owner.crmPage.logOnlyNote') }}</p>
        <input v-model="sms.campaignName" :placeholder="t('owner.crmPage.campaignName')" class="mb-2 w-full rounded border p-2 text-sm" />
        <select v-model="sms.recipient" class="mb-2 w-full rounded border p-2 text-sm">
          <option value="all">{{ t('owner.crmPage.allRecipients') }}</option>
          <option value="vip">{{ t('owner.crmPage.vip') }}</option>
          <option value="inactive">{{ t('owner.crmPage.reactivation') }}</option>
          <option value="atRisk">{{ t('owner.crmPage.noShowRisk') }}</option>
        </select>
        <input v-model="sms.schedule" type="datetime-local" dir="ltr" class="mb-2 w-full rounded border p-2 text-sm tabular-nums">
        <textarea v-model="sms.message" class="mb-2 w-full rounded border p-2 text-sm" rows="4" />
        <button type="button" class="btn-primary" @click="send">{{ t('common.send') }}</button>
        <p v-if="feedback" class="mt-2 text-sm text-brand-gray-600">{{ feedback }}</p>
      </div>

      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-2 font-bold">{{ t('owner.crmPage.reminders') }}</h2>
        <p class="mb-2 text-sm text-brand-gray-600">{{ t('owner.crmPage.remindersInfo') }}</p>
        <div class="space-y-2 text-sm">
          <div v-for="rule in data?.reminders" :key="rule.id" class="rounded-xl border px-3 py-2">
            <p class="font-bold">{{ rule.name }}</p>
            <p class="text-xs text-brand-gray-600">{{ rule.triggerType }} · {{ formatHours(rule.offsetHours) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
