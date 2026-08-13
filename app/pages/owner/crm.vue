<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const localePath = useLocalePath()
const { formatHours } = useFormatters()
const { today } = useLocalDate()
const selectedSegment = ref('all')

/** Persian digits without grouping — for schedule dropdowns / Canva review date. */
function toFaDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!)
}

function pad2(value: number | string) {
  return String(value).padStart(2, '0')
}
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
const sending = ref(false)

const wizardOpen = ref(false)
const wizardStep = ref<1 | 2 | 3>(1)

/** Discrete Canva schedule fields; hour '' = send immediately (no schedule). */
const scheduleParts = reactive({
  hour: '' as string,
  day: 1,
  month: 1,
  year: 1404,
})

const hourOptions = Array.from({ length: 24 }, (_, index) => index)

const scheduleYears = computed(() => {
  const current = isoToJalaali(today()).jy
  return [current, current + 1, current + 2]
})

const scheduleDays = computed(() => {
  const count = jalaaliDaysInMonth(scheduleParts.year, scheduleParts.month)
  return Array.from({ length: count }, (_, index) => index + 1)
})

function resetScheduleParts() {
  const j = isoToJalaali(today())
  scheduleParts.year = j.jy
  scheduleParts.month = j.jm
  scheduleParts.day = j.jd
  scheduleParts.hour = ''
  sms.schedule = ''
}

function syncScheduleFromParts() {
  const maxDay = jalaaliDaysInMonth(scheduleParts.year, scheduleParts.month)
  if (scheduleParts.day > maxDay) scheduleParts.day = maxDay
  if (scheduleParts.hour === '') {
    sms.schedule = ''
    return
  }
  const hour = Number(scheduleParts.hour)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    sms.schedule = ''
    return
  }
  const iso = jalaaliToIso(scheduleParts.year, scheduleParts.month, scheduleParts.day)
  sms.schedule = `${iso}T${String(hour).padStart(2, '0')}:00`
}

watch(
  () => [scheduleParts.hour, scheduleParts.day, scheduleParts.month, scheduleParts.year] as const,
  syncScheduleFromParts,
)

const scheduleReviewLabel = computed(() => {
  if (!sms.schedule) return t('owner.smsWizard.noSchedule')
  const [datePart, timePart = '00:00'] = sms.schedule.split('T')
  const j = isoToJalaali(datePart)
  const date = `${toFaDigits(j.jy)}/${toFaDigits(pad2(j.jm))}/${toFaDigits(pad2(j.jd))}`
  const [hh = '00', mm = '00'] = timePart.split(':')
  const time = `${toFaDigits(pad2(hh))}:${toFaDigits(pad2(mm))}`
  return t('owner.smsWizard.scheduleAt', { date, time })
})

const wizardModalTitle = computed(() =>
  wizardStep.value === 2 ? t('owner.smsWizard.step2Title') : t('owner.crmPage.pushSms'),
)

const liveSms = computed(() =>
  smsStatus.value?.smsMode === 'live'
  && smsStatus.value?.smsPhase === 'MULTI'
  && Boolean(smsStatus.value?.multiReady),
)

const builtInSegments = new Set(['all', 'vip', 'inactive', 'atRisk'])

function segmentLabel(segment: { id: string, name: string }) {
  if (builtInSegments.has(segment.id)) {
    return t(`owner.crmPage.segments.${segment.id}` as 'owner.crmPage.segments.all')
  }
  return segment.name
}

const selectedSegmentLabel = computed(() => {
  const segment = data.value?.segments?.find((item: { id: string }) => item.id === selectedSegment.value)
  return segment ? segmentLabel(segment) : undefined
})

function campaignStatusLabel(status: string) {
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
  if (sent > 0 || queued > 0) {
    return t('owner.crmPage.sent', { sent: sent + queued, total })
  }
  return t('owner.crmPage.logged', { logged: logged || campaign.delivered || 0, total })
}

function recipientLabel(value: string) {
  const map: Record<string, string> = {
    all: t('owner.crmPage.allRecipients'),
    vip: t('owner.crmPage.vip'),
    inactive: t('owner.crmPage.reactivation'),
    atRisk: t('owner.crmPage.noShowRisk'),
  }
  return map[value] || value
}

function contactBadge(c: { segment?: string; totalVisits?: number; risk?: string }) {
  if (c.risk === 'atRisk' || selectedSegment.value === 'atRisk') return t('owner.crmPage.noShowRisk')
  if (c.segment === 'vip' || selectedSegment.value === 'vip') return t('owner.crmPage.vip')
  if ((c.totalVisits || 0) === 0) return t('owner.crmPage.reactivation')
  return ''
}

function openWizard() {
  sms.message = ''
  sms.recipient = 'all'
  sms.campaignName = ''
  resetScheduleParts()
  feedback.value = ''
  wizardStep.value = 1
  wizardOpen.value = true
}

function closeWizard() {
  wizardOpen.value = false
  wizardStep.value = 1
}

const canProceedCompose = computed(() => Boolean(sms.message.trim()))

function goToReview() {
  if (!canProceedCompose.value) return
  syncScheduleFromParts()
  wizardStep.value = 2
}

function backToCompose() {
  wizardStep.value = 1
}

async function send() {
  feedback.value = ''
  sending.value = true
  try {
    syncScheduleFromParts()
    const result = await $fetch<{
      log?: { sent?: boolean, logged?: boolean }
      provider?: string
      campaign?: { status?: string }
    }>('/api/owner/sms', {
      method: 'POST',
      body: {
        ...sms,
        segmentName: selectedSegmentLabel.value,
      },
    })
    const delivered = Boolean(result?.log?.sent) || result?.campaign?.status === 'SENT'
    if (result?.campaign?.status === 'SCHEDULED') {
      feedback.value = t('owner.crmPage.smsScheduled')
    } else if (liveSms.value && delivered) {
      feedback.value = t('owner.crmPage.smsSentFeedback')
    } else {
      feedback.value = t('owner.crmPage.smsLogged')
    }
    refresh()
    refreshSmsStatus()
    wizardStep.value = 3
  } catch {
    feedback.value = t('owner.crmPage.smsFailed')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack pb-24">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.crm')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <p class="text-xs text-brand-gray-500">
        {{ liveSms ? t('owner.crmPage.liveNote') : t('owner.crmPage.logOnlyNote') }}
      </p>

      <div class="canva-crm-stats">
        <div class="canva-crm-stat">
          <p class="canva-crm-stat-value">{{ data?.stats?.totalContacts || 0 }}</p>
          <p class="canva-crm-stat-label">{{ t('owner.crmPage.stats.contacts') }}</p>
        </div>
        <div class="canva-crm-stat">
          <p class="canva-crm-stat-value">{{ data?.stats?.smsSent || 0 }}</p>
          <p class="canva-crm-stat-label">{{ t('owner.crmPage.stats.smsSent') }}</p>
        </div>
        <div class="canva-crm-stat">
          <p class="canva-crm-stat-value">{{ data?.stats?.campaigns || 0 }}</p>
          <p class="canva-crm-stat-label">{{ t('owner.crmPage.stats.campaigns') }}</p>
        </div>
      </div>

      <div class="canva-underline-tabs overflow-x-auto">
        <button
          v-for="segment in data?.segments || []"
          :key="segment.id"
          type="button"
          class="canva-underline-tab shrink-0 whitespace-nowrap"
          :class="selectedSegment === segment.id ? 'canva-underline-tab-active' : ''"
          @click="selectedSegment = segment.id"
        >
          {{ segmentLabel(segment) }}
        </button>
      </div>

      <div class="space-y-0">
        <CanvaEmptyState v-if="!(data?.contacts?.length)" :title="t('owner.crmPage.emptyContacts')" icon="group" />
        <NuxtLink
          v-for="c in data?.contacts || []"
          :key="c.id"
          :to="localePath(`/owner/crm/${c.id}`)"
          class="canva-contact-row"
        >
          <div class="min-w-0 flex-1 text-start">
            <p class="font-bold text-brand-navy">{{ c.name }}</p>
            <p class="mt-0.5 text-xs text-brand-gray-500"><bdi dir="ltr" class="tabular-nums">{{ c.mobile || '—' }}</bdi></p>
          </div>
          <span
            v-if="contactBadge(c)"
            class="shrink-0 bg-brand-primary-soft px-2 py-1 text-[10px] font-bold text-brand-primary"
            style="border-radius: var(--sz-canva-radius);"
          >{{ contactBadge(c) }}</span>
        </NuxtLink>
      </div>

      <div class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.crmPage.recentCampaigns') }}</h2>
        <CanvaEmptyState v-if="!(data?.campaigns?.length)" :title="t('owner.crmPage.emptyCampaigns')" icon="campaign" />
        <div v-for="campaign in data?.campaigns || []" :key="campaign.id" class="canva-list-card">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold text-brand-navy">{{ campaign.name }}</p>
            <span class="canva-history-status canva-history-status-pending">{{ campaignStatusLabel(campaign.status) }}</span>
          </div>
          <p class="mt-1 text-xs text-brand-gray-500">{{ campaign.segmentName || t('owner.crmPage.allRecipients') }}</p>
          <p class="text-xs text-brand-gray-500">{{ campaignResultLabel(campaign) }}</p>
        </div>
      </div>

      <div class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.crmPage.reminders') }}</h2>
        <p class="text-sm text-brand-gray-500">{{ t('owner.crmPage.remindersInfo') }}</p>
        <CanvaEmptyState v-if="!(data?.reminders?.length)" :title="t('owner.crmPage.emptyReminders')" icon="notifications_off" />
        <div v-for="rule in data?.reminders || []" :key="rule.id" class="canva-list-card">
          <p class="font-bold text-brand-navy">{{ rule.name }}</p>
          <p class="mt-1 text-xs text-brand-gray-500">{{ triggerTypeLabel(rule.triggerType) }} · {{ formatHours(rule.offsetHours) }}</p>
        </div>
      </div>
    </AppAsyncState>

    <div class="fixed inset-x-0 z-[40] px-4" style="bottom: calc(var(--sz-tab-bar-height) + var(--sz-safe-bottom) + 0.75rem);">
      <div class="mx-auto canva-phone-shell">
        <button type="button" class="canva-black-cta" @click="openWizard">
          {{ t('owner.smsWizard.openCta') }}
        </button>
      </div>
    </div>

    <AppModal :open="wizardOpen" patterned sheet :title="wizardModalTitle" max-width-class="canva-phone-shell" @close="closeWizard">
      <CanvaSuccessSheet
        v-if="wizardStep === 3"
        :title="t('owner.smsWizard.successTitle')"
        :body="feedback"
      >
        <template #cta>
          <button type="button" class="canva-black-cta" @click="closeWizard">{{ t('owner.smsWizard.successCta') }}</button>
        </template>
      </CanvaSuccessSheet>

      <div v-else class="max-h-[min(75dvh,var(--app-vv-height,75dvh))] overflow-y-auto overscroll-contain p-4">
        <div v-if="wizardStep === 1" class="venus-form-stack">
          <p class="text-xs text-brand-gray-500">{{ liveSms ? t('owner.crmPage.liveNote') : t('owner.crmPage.logOnlyNote') }}</p>

          <label class="block space-y-1 text-start">
            <span class="text-xs font-bold text-brand-gray-600">{{ t('owner.crmPage.campaignName') }}</span>
            <input v-model="sms.campaignName" :placeholder="t('owner.smsWizard.campaignNamePlaceholder')" class="neo-input" />
          </label>

          <label class="block space-y-1 text-start">
            <span class="text-xs font-bold text-brand-gray-600">{{ t('owner.smsWizard.reviewRecipients') }}</span>
            <select v-model="sms.recipient" class="neo-select">
              <option value="all">{{ t('owner.crmPage.allRecipients') }}</option>
              <option value="vip">{{ t('owner.crmPage.vip') }}</option>
              <option value="inactive">{{ t('owner.crmPage.reactivation') }}</option>
              <option value="atRisk">{{ t('owner.crmPage.noShowRisk') }}</option>
            </select>
          </label>

          <div class="space-y-1 text-start">
            <span class="text-xs font-bold text-brand-gray-600">{{ t('owner.smsWizard.reviewSchedule') }}</span>
            <div class="grid grid-cols-4 gap-1.5">
              <select v-model="scheduleParts.hour" class="neo-select w-full px-1 py-2 text-xs tabular-nums" :aria-label="t('owner.smsWizard.scheduleHour')">
                <option value="">{{ t('owner.smsWizard.scheduleHour') }}</option>
                <option v-for="hour in hourOptions" :key="hour" :value="String(hour)">
                  {{ toFaDigits(pad2(hour)) }}:{{ toFaDigits('00') }}
                </option>
              </select>
              <select v-model.number="scheduleParts.day" class="neo-select w-full px-1 py-2 text-xs tabular-nums" :aria-label="t('owner.smsWizard.scheduleDay')">
                <option v-for="day in scheduleDays" :key="day" :value="day">{{ toFaDigits(day) }}</option>
              </select>
              <select v-model.number="scheduleParts.month" class="neo-select w-full px-1 py-2 text-xs" :aria-label="t('owner.smsWizard.scheduleMonth')">
                <option v-for="(month, index) in PERSIAN_MONTHS" :key="month" :value="index + 1">{{ month }}</option>
              </select>
              <select v-model.number="scheduleParts.year" class="neo-select w-full px-1 py-2 text-xs tabular-nums" dir="ltr" :aria-label="t('owner.smsWizard.scheduleYear')">
                <option v-for="year in scheduleYears" :key="year" :value="year">{{ toFaDigits(year) }}</option>
              </select>
            </div>
            <p class="text-[10px] text-brand-gray-500">{{ t('owner.smsWizard.scheduleHint') }}</p>
          </div>

          <label class="block space-y-1 text-start">
            <span class="text-xs font-bold text-brand-gray-600">{{ t('owner.smsWizard.reviewMessage') }}</span>
            <textarea v-model="sms.message" class="neo-input min-h-24" rows="4" :placeholder="t('owner.smsWizard.messagePlaceholder')" />
          </label>

          <button type="button" class="canva-black-cta" :disabled="!canProceedCompose" @click="goToReview">
            {{ t('owner.smsWizard.next') }}
          </button>
        </div>

        <div v-else-if="wizardStep === 2" class="venus-form-stack">
          <div class="space-y-3 text-sm text-start">
            <div class="flex items-center justify-between gap-2">
              <span class="text-brand-gray-500">{{ t('owner.smsWizard.reviewCampaign') }}</span>
              <span class="font-bold text-brand-navy">{{ sms.campaignName || '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-brand-gray-500">{{ t('owner.smsWizard.reviewRecipients') }}</span>
              <span class="font-bold text-brand-primary">{{ recipientLabel(sms.recipient) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-brand-gray-500">{{ t('owner.smsWizard.reviewSchedule') }}</span>
              <span class="font-bold tabular-nums text-brand-navy">{{ scheduleReviewLabel }}</span>
            </div>
            <div>
              <span class="block text-brand-gray-500">{{ t('owner.smsWizard.reviewMessage') }}</span>
              <p class="mt-1 whitespace-pre-wrap font-bold text-brand-navy">{{ sms.message }}</p>
            </div>
          </div>
          <p v-if="feedback" class="canva-flash-error">{{ feedback }}</p>
          <div class="flex gap-3">
            <button type="button" class="canva-gate-btn-secondary flex-1" :disabled="sending" @click="backToCompose">
              {{ t('owner.smsWizard.edit') }}
            </button>
            <button type="button" class="canva-black-cta flex-1" :disabled="sending" @click="send">
              {{ sending ? t('common.loading') : t('owner.smsWizard.confirm') }}
            </button>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>
