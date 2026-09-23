<script setup lang="ts">
import { IRAN_WEEKDAY_ORDER, weekdayNameFromDate } from '#shared/recurringSessions.ts'
import { jalaliMonthEndIso } from '#shared/jalali.ts'
import { expandSeasonRules, type SeasonSessionRule } from '#shared/seasonSessions.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import { whatsappHrefForIranMobile } from '#shared/payPin.ts'
import { isPastDate } from '#shared/localDate.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { formatDate, formatCurrency, formatNumber, formatTimeLabel, formatFaDigits } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()
const { recurringReserveEnabled } = usePilotFlags()
const { public: { paymentsMode } } = useRuntimeConfig()
const payAtClubMode = computed(() => (paymentsMode || 'pay_at_club') === 'pay_at_club')

type CourtRow = { id: string; nameFa: string; nameEn: string; price?: number }
type PreviewRow = { date: string; startTime: string; endTime?: string; courtId: string; price?: number }
type ConflictRow = { date: string; startTime: string; courtId?: string; reason: string }

const step = ref<1 | 2 | 3>(1)
const saving = ref(false)
const previewing = ref(false)
const formError = ref('')

const guestFullName = ref('')
const guestMobile = ref('')
const startDate = ref('')
const finishDate = ref('')
const comments = ref('')

type RuleRow = {
  id: string
  weekday: string
  startTime: string
  endTime: string
  courtId: string
}

const rules = ref<RuleRow[]>([])
const occurrences = ref<PreviewRow[]>([])
const conflicts = ref<ConflictRow[]>([])
const totalAmount = ref(0)

const lastPayLink = ref<{ url: string; pin: string; mobile: string } | null>(null)
const payLinkCopied = ref(false)
const done = ref(false)
const slotsCreated = ref(0)

const { data: courtsData } = await useAuthedFetch<CourtRow[]>('/api/owner/courts')
const courts = computed(() => courtsData.value || [])

const timeOptions = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
]

function courtLabel(court: CourtRow) {
  return locale.value === 'fa'
    ? formatFaDigits(court.nameFa || court.nameEn)
    : (court.nameEn || court.nameFa)
}

function courtNameById(id: string) {
  const court = courts.value.find((c) => c.id === id)
  return court ? courtLabel(court) : id
}

function newRuleId() {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function addRule(partial?: Partial<RuleRow>) {
  const courtId = partial?.courtId || courts.value[0]?.id || ''
  rules.value.push({
    id: newRuleId(),
    weekday: partial?.weekday || 'Sat',
    startTime: partial?.startTime || '18:00',
    endTime: partial?.endTime || '19:00',
    courtId,
  })
}

function removeRule(id: string) {
  rules.value = rules.value.filter((r) => r.id !== id)
}

function removeOccurrence(index: number) {
  occurrences.value = occurrences.value.filter((_, i) => i !== index)
  totalAmount.value = occurrences.value.reduce((sum, row) => sum + (row.price || 0), 0)
}

const dateRangeInvalid = computed(() =>
  Boolean(startDate.value && finishDate.value && finishDate.value < startDate.value),
)
const startInPast = computed(() => Boolean(startDate.value && isPastDate(startDate.value)))
const datesValid = computed(() =>
  Boolean(startDate.value && finishDate.value && !dateRangeInvalid.value && !startInPast.value),
)

function guestNameParts() {
  const parts = guestFullName.value.trim().split(/\s+/).filter(Boolean)
  return {
    guestName: parts[0] || '',
    guestFamily: parts.slice(1).join(' '),
  }
}

function guestValid() {
  return Boolean(guestFullName.value.trim() && guestMobile.value.trim())
}

function rulesValid() {
  return rules.value.length > 0 && rules.value.every((r) =>
    r.weekday && r.courtId && r.startTime && r.endTime && r.endTime > r.startTime,
  )
}

function toApiRules(): SeasonSessionRule[] {
  return rules.value.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    courtId: r.courtId,
  }))
}

function applyMonthDefault() {
  if (!startDate.value) startDate.value = today()
  finishDate.value = jalaliMonthEndIso(startDate.value)
}

watch(startDate, (next, prev) => {
  if (!next) return
  // Keep finish at month-end of start when user hasn't customized past default, or finish empty.
  if (!finishDate.value || !prev || finishDate.value === jalaliMonthEndIso(prev)) {
    finishDate.value = jalaliMonthEndIso(next)
  }
})

function initFromQuery() {
  const q = route.query
  const start = String(q.start || q.date || '').trim() || today()
  startDate.value = start
  finishDate.value = String(q.finish || '').trim() || jalaliMonthEndIso(start)
  guestFullName.value = String(q.guestName || '').trim()
  guestMobile.value = String(q.guestMobile || '').trim()
  comments.value = String(q.comments || '').trim()

  const courtId = String(q.courtId || '').trim()
  const startTime = String(q.startTime || '').trim().slice(0, 5)
  const endTimeRaw = String(q.endTime || '').trim().slice(0, 5)
  const weekday = String(q.weekday || '').trim()
  if (courtId || startTime) {
    const endTime = endTimeRaw || (startTime
      ? `${String(Number.parseInt(startTime.slice(0, 2), 10) + 1).padStart(2, '0')}:00`
      : '19:00')
    addRule({
      courtId: courtId || courts.value[0]?.id,
      startTime: startTime || '18:00',
      endTime,
      weekday: weekday || weekdayNameFromDate(start),
    })
  }
  else if (!rules.value.length && courts.value[0]) {
    addRule()
  }
}

onMounted(() => {
  if (!recurringReserveEnabled.value) return
  initFromQuery()
})

watch(courts, (list) => {
  if (list.length && !rules.value.length && recurringReserveEnabled.value) {
    initFromQuery()
  }
}, { once: true })

async function goStep2() {
  formError.value = ''
  if (!guestValid()) {
    formError.value = t('owner.guestRequired')
    return
  }
  if (!datesValid.value) {
    formError.value = startInPast.value
      ? t('owner.errors.startDateInPast')
      : t('owner.packagesPage.dateRangeInvalid')
    return
  }
  if (!rules.value.length) addRule()
  step.value = 2
}

async function runPreview() {
  formError.value = ''
  if (!rulesValid()) {
    formError.value = t('owner.seasonPage.rulesRequired')
    return
  }
  previewing.value = true
  try {
    const preview = await $fetch<{
      willCreate: PreviewRow[]
      willCreateCount: number
      conflicts: ConflictRow[]
      skippedCount: number
      totalAmount: number
    }>('/api/owner/recurring-preview', {
      method: 'POST',
      body: {
        startDate: startDate.value,
        finishDate: finishDate.value,
        rules: toApiRules(),
      },
    })
    occurrences.value = [...(preview.willCreate || [])]
    conflicts.value = preview.conflicts || []
    totalAmount.value = preview.totalAmount || occurrences.value.reduce((s, r) => s + (r.price || 0), 0)
    if (!occurrences.value.length) {
      formError.value = t('owner.seasonPage.noFreeSlots')
      return
    }
    step.value = 3
  }
  catch (error) {
    formError.value = fetchErrorMessage(error, t('common.error'))
  }
  finally {
    previewing.value = false
  }
}

async function confirmReserve(mode: 'cash' | 'unpaid') {
  formError.value = ''
  if (!occurrences.value.length) {
    formError.value = t('owner.seasonPage.noFreeSlots')
    return
  }
  saving.value = true
  lastPayLink.value = null
  try {
    const guest = guestNameParts()
    const result = await $fetch<{
      slotsCreated?: number
      payPin?: string
      payUrl?: string
      totalAmount?: number
    }>('/api/owner/season', {
      method: 'POST',
      body: {
        guestName: guest.guestName,
        guestFamily: guest.guestFamily,
        guestMobile: normalizeIranPhone(guestMobile.value) || guestMobile.value,
        startDate: startDate.value,
        finishDate: finishDate.value,
        comments: comments.value || undefined,
        sessions: occurrences.value.map((o) => ({
          date: o.date,
          startTime: o.startTime,
          courtId: o.courtId,
        })),
        paymentStatus: mode === 'cash' ? 'PAID' : 'PAY_AT_CLUB',
        paymentMethod: mode === 'cash' ? 'CASH' : (payAtClubMode.value ? 'CASH' : 'IPG'),
      },
    })
    slotsCreated.value = result.slotsCreated || occurrences.value.length
    if (mode === 'unpaid' && result.payUrl && result.payPin) {
      lastPayLink.value = {
        url: result.payUrl,
        pin: result.payPin,
        mobile: normalizeIranPhone(guestMobile.value) || guestMobile.value,
      }
    }
    done.value = true
  }
  catch (error) {
    formError.value = fetchErrorMessage(error, t('common.error'))
  }
  finally {
    saving.value = false
  }
}

async function copyPayLink() {
  const url = lastPayLink.value?.url
  if (!url || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(url)
    payLinkCopied.value = true
  }
  catch {
    payLinkCopied.value = false
  }
}

const payLinkWhatsappHref = computed(() => {
  const link = lastPayLink.value
  if (!link) return ''
  return whatsappHrefForIranMobile(link.mobile, t('owner.payLinkWhatsappText', { url: link.url }))
})

/** Local expand count hint before preview. */
const localExpandCount = computed(() => {
  if (!datesValid.value || !rulesValid()) return 0
  return expandSeasonRules({
    startDate: startDate.value,
    finishDate: finishDate.value,
    rules: toApiRules(),
  }).length
})
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4 pb-24">
    <CanvaSubpageHeader to="/owner/calendar" :title="t('owner.seasonPage.title')" />

    <div v-if="!recurringReserveEnabled" class="space-y-3 border border-brand-gray-100 bg-white p-4" style="border-radius: var(--sz-canva-radius);">
      <p class="text-sm font-bold text-brand-navy">{{ t('owner.seasonUnavailable.title') }}</p>
      <p class="text-sm text-brand-gray-600">{{ t('owner.seasonUnavailable.body') }}</p>
      <NuxtLink
        :to="localePath('/owner/calendar')"
        class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
        style="border-radius: var(--sz-canva-radius);"
      >
        {{ t('owner.reserveRedirect.cta') }}
      </NuxtLink>
    </div>

    <template v-else-if="done">
      <div class="space-y-3 border border-brand-gray-100 bg-white p-4" style="border-radius: var(--sz-canva-radius);">
        <p class="text-sm font-bold text-brand-navy">
          {{ t('owner.seasonPage.slotsCreatedFlash', { count: formatNumber(slotsCreated) }) }}
        </p>
        <template v-if="lastPayLink">
          <p class="text-start text-sm text-brand-gray-600">{{ t('owner.payLinkSentHint') }}</p>
          <p class="break-all text-start text-sm font-bold text-brand-navy" dir="ltr">{{ lastPayLink.url }}</p>
          <button type="button" class="canva-gate-btn-primary w-full" @click="copyPayLink">
            {{ payLinkCopied ? t('owner.payLinkCopied') : t('owner.copyPayLink') }}
          </button>
          <a
            v-if="payLinkWhatsappHref"
            :href="payLinkWhatsappHref"
            target="_blank"
            rel="noopener"
            class="canva-gate-btn-secondary inline-flex w-full items-center justify-center"
          >
            {{ t('owner.sendPayLinkWhatsapp') }}
          </a>
        </template>
        <NuxtLink
          :to="localePath('/owner/calendar')"
          class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
          style="border-radius: var(--sz-canva-radius);"
        >
          {{ t('owner.reserveRedirect.cta') }}
        </NuxtLink>
      </div>
    </template>

    <template v-else>
      <div class="flex items-center gap-2 text-xs font-bold text-brand-gray-600">
        <span :class="step >= 1 ? 'text-brand-primary' : ''">{{ formatFaDigits('1') }} · {{ t('owner.seasonPage.stepGuest') }}</span>
        <span>·</span>
        <span :class="step >= 2 ? 'text-brand-primary' : ''">{{ formatFaDigits('2') }} · {{ t('owner.seasonPage.stepRules') }}</span>
        <span>·</span>
        <span :class="step >= 3 ? 'text-brand-primary' : ''">{{ formatFaDigits('3') }} · {{ t('owner.seasonPage.stepConfirm') }}</span>
      </div>

      <p v-if="formError" class="venus-alert-error">{{ formError }}</p>

      <!-- Step 1: guest + dates -->
      <div v-show="step === 1" class="space-y-4 border border-brand-gray-100 bg-white p-4" style="border-radius: var(--sz-canva-radius);">
        <AppFormField :label="t('owner.guestFullName')" required>
          <input v-model="guestFullName" class="neo-input" autocomplete="name" required>
        </AppFormField>
        <AppFormField :label="t('owner.guestMobile')" required>
          <input
            v-model="guestMobile"
            dir="ltr"
            class="neo-input tabular-nums"
            inputmode="tel"
            autocomplete="tel"
            required
          >
        </AppFormField>
        <AppFormField :label="t('owner.packagesPage.dateRange')" required>
          <AppDateRangeInput
            v-model:start="startDate"
            v-model:end="finishDate"
            hide-label
            :invalid="dateRangeInvalid || startInPast || !finishDate"
            :invalid-message="startInPast ? t('owner.errors.startDateInPast') : (!finishDate ? t('owner.seasonPage.finishRequired') : t('owner.packagesPage.dateRangeInvalid'))"
          />
          <p class="mt-1 text-start text-[11px] text-brand-gray-500">{{ t('owner.seasonPage.defaultRangeHint') }}</p>
          <button type="button" class="mt-2 text-xs font-bold text-brand-primary" @click="applyMonthDefault">
            {{ t('owner.seasonPage.useMonthEnd') }}
          </button>
        </AppFormField>
        <AppFormField :label="t('owner.comments')">
          <textarea v-model="comments" class="neo-textarea" rows="2" />
        </AppFormField>
        <button type="button" class="canva-gate-btn-primary w-full" @click="goStep2">
          {{ t('common.next') }}
        </button>
      </div>

      <!-- Step 2: rules -->
      <div v-show="step === 2" class="space-y-4">
        <p class="text-start text-sm text-brand-gray-600">{{ t('owner.seasonPage.rulesHint') }}</p>
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="space-y-3 border border-brand-gray-100 bg-white p-4" style="border-radius: var(--sz-canva-radius);"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-bold text-brand-navy">{{ t('owner.seasonPage.sessionRule') }}</p>
            <button
              type="button"
              class="text-xs font-bold text-brand-primary"
              :disabled="rules.length <= 1"
              @click="removeRule(rule.id)"
            >
              {{ t('common.remove') }}
            </button>
          </div>
          <div>
            <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.weekdays') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="day in IRAN_WEEKDAY_ORDER"
                :key="`${rule.id}-${day}`"
                type="button"
                class="canva-chip"
                :class="rule.weekday === day ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
                @click="rule.weekday = day"
              >
                {{ t(`owner.weekdays.${day}`) }}
              </button>
            </div>
          </div>
          <OwnerCompactTimeRange
            :start-time="rule.startTime"
            :end-time="rule.endTime"
            :options="timeOptions"
            @update:start-time="rule.startTime = $event"
            @update:end-time="rule.endTime = $event"
          />
          <div>
            <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.court') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="court in courts"
                :key="`${rule.id}-${court.id}`"
                type="button"
                class="canva-chip"
                :class="rule.courtId === court.id ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
                @click="rule.courtId = court.id"
              >
                {{ courtLabel(court) }}
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="canva-gate-btn-secondary w-full" @click="addRule()">
          {{ t('owner.seasonPage.addRule') }}
        </button>
        <p v-if="localExpandCount" class="text-start text-xs text-brand-gray-600">
          {{ t('owner.seasonPage.expandHint', { count: formatNumber(localExpandCount) }) }}
        </p>
        <div class="flex gap-2">
          <button type="button" class="canva-gate-btn-secondary flex-1" @click="step = 1">
            {{ t('common.back') }}
          </button>
          <button
            type="button"
            class="canva-gate-btn-primary flex-1"
            :disabled="previewing || !rulesValid()"
            @click="runPreview"
          >
            {{ previewing ? t('common.loading') : t('owner.seasonPage.preview') }}
          </button>
        </div>
      </div>

      <!-- Step 3: preview + pay -->
      <div v-show="step === 3" class="space-y-4">
        <div class="space-y-2 border border-brand-gray-100 bg-brand-lavender p-4 text-sm font-bold text-brand-navy" style="border-radius: var(--sz-canva-radius);">
          <p>
            {{ t('owner.seasonPage.previewSummary', {
              create: formatNumber(occurrences.length),
              skip: formatNumber(conflicts.length),
            }) }}
          </p>
          <p class="text-xs font-medium text-brand-gray-600">{{ t('owner.seasonPage.conflictSoftHint') }}</p>
        </div>

        <div v-if="occurrences.length" class="space-y-2 border border-brand-gray-100 bg-white p-4" style="border-radius: var(--sz-canva-radius);">
          <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.seasonPage.willCreateTitle') }}</p>
          <ul class="max-h-64 space-y-2 overflow-y-auto text-xs">
            <li
              v-for="(item, idx) in occurrences"
              :key="`occ-${item.courtId}-${item.date}-${item.startTime}-${idx}`"
              class="flex items-start justify-between gap-2 border-b border-brand-gray-100 pb-2"
            >
              <span class="text-start text-brand-navy">
                {{ courtNameById(item.courtId) }} · {{ formatDate(item.date) }} ·
                <bdi dir="ltr">{{ formatTimeLabel(item.startTime) }}</bdi>
                <template v-if="item.price != null"> · {{ formatCurrency(item.price) }}</template>
              </span>
              <button type="button" class="shrink-0 text-brand-primary" @click="removeOccurrence(idx)">
                {{ t('common.remove') }}
              </button>
            </li>
          </ul>
        </div>

        <div v-if="conflicts.length" class="space-y-2 border border-amber-200 bg-amber-50 p-4" style="border-radius: var(--sz-canva-radius);">
          <p class="text-xs font-bold text-brand-navy">{{ t('owner.seasonPage.conflictsTitle') }}</p>
          <p class="text-xs font-medium text-brand-gray-600">{{ t('owner.seasonPage.conflictSoftHint') }}</p>
          <ul class="max-h-40 space-y-1 overflow-y-auto text-xs text-brand-gray-600">
            <li
              v-for="(item, idx) in conflicts.slice(0, 24)"
              :key="`c-${item.courtId || ''}-${item.date}-${item.startTime}-${idx}`"
            >
              <template v-if="item.courtId">{{ courtNameById(item.courtId) }} · </template>
              {{ formatDate(item.date) }} ·
              <bdi dir="ltr">{{ formatTimeLabel(item.startTime) }}</bdi>
              — {{ t(`owner.seasonPage.conflictReason.${item.reason}`) }}
            </li>
          </ul>
        </div>

        <div class="border border-brand-gray-100 bg-white p-4 text-sm font-bold text-brand-navy" style="border-radius: var(--sz-canva-radius);">
          <div class="flex items-center justify-between gap-2">
            <span>{{ t('owner.priceBreakdown.total') }}</span>
            <span dir="ltr">{{ formatCurrency(totalAmount) }}</span>
          </div>
          <p class="mt-1 text-xs font-medium text-brand-gray-600">{{ t('owner.seasonPage.onePaymentHint') }}</p>
        </div>

        <div class="flex gap-2">
          <button type="button" class="canva-gate-btn-secondary flex-1" :disabled="saving" @click="step = 2">
            {{ t('common.back') }}
          </button>
        </div>
        <button
          type="button"
          class="canva-gate-btn-primary w-full"
          :disabled="saving || !occurrences.length"
          @click="confirmReserve('cash')"
        >
          {{ saving ? t('common.loading') : t('owner.payCash') }}
        </button>
        <button
          type="button"
          class="canva-desk-pay-tertiary w-full"
          :disabled="saving || !occurrences.length"
          @click="confirmReserve('unpaid')"
        >
          {{ saving ? t('common.loading') : (payAtClubMode ? t('owner.reserveUnpaid') : t('owner.sendPayLink')) }}
        </button>
      </div>
    </template>
  </div>
</template>
