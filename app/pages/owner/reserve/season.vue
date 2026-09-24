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
const { formatDate, formatCurrency, formatNumber, formatTimeLabel, formatFaDigits, formatPhone } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()
const { recurringReserveEnabled } = usePilotFlags()
const { public: { paymentsMode } } = useRuntimeConfig()
const payAtClubMode = computed(() => (paymentsMode || 'pay_at_club') === 'pay_at_club')

type CourtRow = { id: string; nameFa: string; nameEn: string; price?: number }
type PreviewRow = { date: string; startTime: string; endTime?: string; courtId: string; price?: number }
type ConflictRow = { date: string; startTime: string; courtId?: string; reason: string }

/** UI rule: multi weekday × multi court; expands to SeasonSessionRule[] for APIs. */
type RuleRow = {
  id: string
  weekdays: string[]
  startTime: string
  endTime: string
  courtIds: string[]
}

type SessionListRow =
  | { kind: 'free'; index: number; row: PreviewRow }
  | { kind: 'conflict'; row: ConflictRow }

const step = ref<1 | 2 | 3>(1)
const saving = ref(false)
const previewing = ref(false)
const formError = ref('')
const successOpen = ref(false)
const lastPayMode = ref<'cash' | 'unpaid' | null>(null)

const guestFullName = ref('')
const guestMobile = ref('')
const guestFullNameInput = ref<HTMLInputElement | null>(null)
const guestMobileInput = ref<HTMLInputElement | null>(null)
const startDate = ref('')
const finishDate = ref('')
const comments = ref('')

const rules = ref<RuleRow[]>([])
const occurrences = ref<PreviewRow[]>([])
const conflicts = ref<ConflictRow[]>([])
const totalAmount = ref(0)

const lastPayLink = ref<{ url: string; pin: string; mobile: string; guestName?: string } | null>(null)
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

function addRule(partial?: Partial<RuleRow> & { weekday?: string; courtId?: string }) {
  const courtId = partial?.courtId || partial?.courtIds?.[0] || courts.value[0]?.id || ''
  const weekday = partial?.weekday || partial?.weekdays?.[0] || 'Sat'
  rules.value.push({
    id: newRuleId(),
    weekdays: partial?.weekdays?.length ? [...partial.weekdays] : [weekday],
    startTime: partial?.startTime || '18:00',
    endTime: partial?.endTime || '19:00',
    courtIds: partial?.courtIds?.length ? [...partial.courtIds] : (courtId ? [courtId] : []),
  })
}

function removeRule(id: string) {
  rules.value = rules.value.filter((r) => r.id !== id)
}

function toggleWeekday(rule: RuleRow, day: string) {
  const ix = rule.weekdays.indexOf(day)
  if (ix >= 0) {
    if (rule.weekdays.length <= 1) return
    rule.weekdays.splice(ix, 1)
  }
  else {
    rule.weekdays.push(day)
  }
}

function toggleCourt(rule: RuleRow, courtId: string) {
  const ix = rule.courtIds.indexOf(courtId)
  if (ix >= 0) {
    if (rule.courtIds.length <= 1) return
    rule.courtIds.splice(ix, 1)
  }
  else {
    rule.courtIds.push(courtId)
  }
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

const rangeLabel = computed(() => {
  if (startDate.value && finishDate.value) {
    return t('owner.seasonPage.rangeSelected', {
      start: formatDate(startDate.value),
      end: formatDate(finishDate.value),
    })
  }
  if (startDate.value) {
    return t('owner.seasonPage.rangeStartOnly', { start: formatDate(startDate.value) })
  }
  return t('owner.seasonPage.rangeEmpty')
})

function guestNameParts() {
  const parts = guestFullName.value.trim().split(/\s+/).filter(Boolean)
  return {
    guestName: parts[0] || '',
    guestFamily: parts.slice(1).join(' '),
  }
}

/** Browser autofill can paint values into the DOM without updating v-model. */
function syncGuestFieldsFromDom() {
  const nameEl = guestFullNameInput.value
  const mobileEl = guestMobileInput.value
  if (nameEl) guestFullName.value = nameEl.value
  if (mobileEl) guestMobile.value = mobileEl.value
}

function guestFieldsErrorMessage() {
  syncGuestFieldsFromDom()
  if (!guestFullName.value.trim() || !guestMobile.value.trim()) return t('owner.guestRequired')
  if (!normalizeIranPhone(guestMobile.value)) return t('owner.guestMobileInvalid')
  return ''
}

function rulesValid() {
  return rules.value.length > 0 && rules.value.every((r) =>
    r.weekdays.length > 0
    && r.courtIds.length > 0
    && r.startTime
    && r.endTime
    && r.endTime > r.startTime,
  )
}

/** Expand multi-select UI rules into one weekday × one court API rows. */
function toApiRules(): SeasonSessionRule[] {
  return rules.value.flatMap((r) =>
    r.weekdays.flatMap((weekday) =>
      r.courtIds.map((courtId) => ({
        weekday,
        startTime: r.startTime,
        endTime: r.endTime,
        courtId,
      })),
    ),
  )
}

function applyMonthDefault() {
  if (!startDate.value) startDate.value = today()
  finishDate.value = jalaliMonthEndIso(startDate.value)
}

function goStep(n: 1 | 2 | 3) {
  if (n >= step.value) return
  step.value = n
  formError.value = ''
}

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
  const guestError = guestFieldsErrorMessage()
  if (guestError) {
    formError.value = guestError
    return
  }
  if (!datesValid.value) {
    formError.value = startInPast.value
      ? t('owner.errors.startDateInPast')
      : (!finishDate.value ? t('owner.seasonPage.finishRequired') : t('owner.packagesPage.dateRangeInvalid'))
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
  syncGuestFieldsFromDom()
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
    lastPayMode.value = mode
    if (mode === 'unpaid' && result.payUrl && result.payPin) {
      lastPayLink.value = {
        url: result.payUrl,
        pin: result.payPin,
        mobile: normalizeIranPhone(guestMobile.value) || guestMobile.value,
        guestName: guest.guestName,
      }
    }
    done.value = true
    successOpen.value = true
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
  const name = String(link.guestName || '').trim() || 'دوست'
  return whatsappHrefForIranMobile(link.mobile, t('owner.payLinkWhatsappText', { url: link.url, name }))
})

const localExpandCount = computed(() => {
  if (!datesValid.value || !rulesValid()) return 0
  return expandSeasonRules({
    startDate: startDate.value,
    finishDate: finishDate.value,
    rules: toApiRules(),
  }).length
})

const sessionList = computed((): SessionListRow[] => {
  const free: SessionListRow[] = occurrences.value.map((row, index) => ({ kind: 'free', index, row }))
  const busy: SessionListRow[] = conflicts.value.map((row) => ({ kind: 'conflict', row }))
  return [...free, ...busy].sort((a, b) => {
    const da = a.kind === 'free' ? a.row.date : a.row.date
    const db = b.kind === 'free' ? b.row.date : b.row.date
    if (da !== db) return da.localeCompare(db)
    const ta = a.kind === 'free' ? a.row.startTime : a.row.startTime
    const tb = b.kind === 'free' ? b.row.startTime : b.row.startTime
    return ta.localeCompare(tb)
  })
})

const step3Banner = computed(() => {
  const free = occurrences.value.length
  const skip = conflicts.value.length
  if (!free && !skip) {
    return { tone: 'err' as const, text: t('owner.seasonPage.bannerEmpty') }
  }
  if (skip) {
    return {
      tone: 'warn' as const,
      text: t('owner.seasonPage.previewSummary', {
        create: formatNumber(free),
        skip: formatNumber(skip),
      }),
    }
  }
  return {
    tone: 'ok' as const,
    text: t('owner.seasonPage.bannerOk', { count: formatNumber(free) }),
  }
})

const successTitle = computed(() =>
  lastPayMode.value === 'cash'
    ? t('owner.seasonPage.successCashTitle')
    : t('owner.seasonPage.successLinkTitle'),
)

const successBody = computed(() => {
  const name = guestFullName.value.trim() || '—'
  const count = formatNumber(slotsCreated.value)
  const amount = formatCurrency(totalAmount.value)
  const phone = guestMobile.value ? formatPhone(guestMobile.value) : '—'
  if (lastPayMode.value === 'cash') {
    return t('owner.seasonPage.successCashBody', { count, name, amount, phone })
  }
  return t('owner.seasonPage.successLinkBody', { name, amount })
})

const phoneSmsHint = computed(() => t('owner.seasonPage.phoneSmsHint'))
</script>

<template>
  <div class="season-wiz mx-auto max-w-[920px] space-y-4 px-4 py-4 pb-24">
    <CanvaSubpageHeader to="/owner/calendar" :title="t('owner.seasonPage.title')" />

    <div v-if="!recurringReserveEnabled" class="season-wiz-card space-y-3 p-4">
      <p class="text-sm font-bold text-brand-navy">{{ t('owner.seasonUnavailable.title') }}</p>
      <p class="text-sm text-brand-gray-600">{{ t('owner.seasonUnavailable.body') }}</p>
      <NuxtLink
        :to="localePath('/owner/calendar')"
        class="season-wiz-btn season-wiz-btn-primary inline-flex w-full items-center justify-center"
      >
        {{ t('owner.reserveRedirect.cta') }}
      </NuxtLink>
    </div>

    <template v-else-if="done">
      <div class="season-wiz-card space-y-3 p-4">
        <p class="text-sm font-bold text-brand-navy">
          {{ t('owner.seasonPage.slotsCreatedFlash', { count: formatNumber(slotsCreated) }) }}
        </p>
        <template v-if="lastPayLink">
          <p class="text-start text-sm text-brand-gray-600">{{ t('owner.payLinkSentHint') }}</p>
          <p class="break-all text-start text-sm font-bold text-brand-navy" dir="ltr">{{ lastPayLink.url }}</p>
          <button type="button" class="season-wiz-btn season-wiz-btn-primary w-full" @click="copyPayLink">
            {{ payLinkCopied ? t('owner.payLinkCopied') : t('owner.copyPayLink') }}
          </button>
          <a
            v-if="payLinkWhatsappHref"
            :href="payLinkWhatsappHref"
            target="_blank"
            rel="noopener"
            class="season-wiz-btn season-wiz-btn-outline inline-flex w-full items-center justify-center"
          >
            {{ t('owner.sendPayLinkWhatsapp') }}
          </a>
        </template>
        <NuxtLink
          :to="localePath('/owner/calendar')"
          class="season-wiz-btn season-wiz-btn-primary inline-flex w-full items-center justify-center"
        >
          {{ t('owner.reserveRedirect.cta') }}
        </NuxtLink>
      </div>
    </template>

    <section v-else class="season-wiz-card p-5 sm:p-7" aria-label="wizard">
      <ol class="season-wiz-steps mb-6 flex list-none items-center gap-2 overflow-x-auto border-b border-[#ECE9E4] pb-5">
        <li v-for="n in ([1, 2, 3] as const)" :key="n" class="flex flex-none items-center gap-2">
          <button
            type="button"
            class="season-wiz-step"
            :class="{
              'is-active': step === n,
              'is-done': step > n,
              'is-todo': step < n,
            }"
            :aria-current="step === n ? 'step' : undefined"
            :disabled="n >= step"
            @click="goStep(n)"
          >
            <span class="season-wiz-step-num">{{ formatFaDigits(String(n)) }}</span>
            <span v-if="n === 1">{{ t('owner.seasonPage.stepGuest') }}</span>
            <span v-else-if="n === 2">{{ t('owner.seasonPage.stepRules') }}</span>
            <span v-else>{{ t('owner.seasonPage.stepConfirm') }}</span>
          </button>
        </li>
      </ol>

      <p v-if="formError" class="venus-alert-error mb-4">{{ formError }}</p>

      <!-- Step 1 -->
      <div v-show="step === 1">
        <div class="season-wiz-p1 grid gap-6 lg:grid-cols-[5fr_6fr]">
          <div class="min-w-0 space-y-4">
            <AppFormField :label="t('owner.guestFullName')" required>
              <input
                ref="guestFullNameInput"
                v-model="guestFullName"
                class="neo-input season-wiz-inp"
                autocomplete="off"
                required
              >
            </AppFormField>
            <AppFormField :label="t('owner.guestMobile')" required>
              <input
                ref="guestMobileInput"
                v-model="guestMobile"
                dir="ltr"
                class="neo-input season-wiz-inp tabular-nums"
                inputmode="tel"
                autocomplete="off"
                required
              >
              <p class="mt-1 text-start text-[12px] text-[#8C8A84]">{{ phoneSmsHint }}</p>
            </AppFormField>
            <div class="season-wiz-range-box">
              <p class="text-sm font-extrabold text-[#C0141F]" aria-live="polite">{{ rangeLabel }}</p>
              <p class="mt-1 text-start text-[12px] text-[#8C8A84]">{{ t('owner.seasonPage.rangeHint') }}</p>
              <button type="button" class="mt-2 text-xs font-bold text-brand-primary" @click="applyMonthDefault">
                {{ t('owner.seasonPage.useMonthEnd') }}
              </button>
            </div>
            <AppFormField :label="t('owner.comments')" field-id="season-comments">
              <textarea id="season-comments" v-model="comments" class="neo-textarea" rows="2" />
            </AppFormField>
          </div>
          <div class="season-wiz-cal min-w-0 border border-[#ECE9E4] bg-white p-4">
            <AppJalaliCalendar
              v-model="startDate"
              v-model:range-end="finishDate"
              mode="range"
              variant="owner"
              :min-date="today()"
            />
            <div class="mt-3 flex flex-wrap gap-4 text-[11.5px] text-[#8C8A84]">
              <span class="inline-flex items-center gap-1.5">
                <i class="season-wiz-lg season-wiz-lg-edge" aria-hidden="true" />
                {{ t('owner.seasonPage.calLegendEdge') }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <i class="season-wiz-lg season-wiz-lg-in" aria-hidden="true" />
                {{ t('owner.seasonPage.calLegendIn') }}
              </span>
            </div>
          </div>
        </div>
        <div class="season-wiz-actions mt-6 flex gap-3 border-t border-[#ECE9E4] pt-5">
          <span class="flex-1" />
          <button type="button" class="season-wiz-btn season-wiz-btn-primary" @click="goStep2">
            {{ t('common.next') }}
          </button>
        </div>
      </div>

      <!-- Step 2 -->
      <div v-show="step === 2" class="space-y-4">
        <p class="text-start text-sm text-[#55534E]">{{ t('owner.seasonPage.rulesHint') }}</p>
        <div
          v-for="(rule, ruleIndex) in rules"
          :key="rule.id"
          class="season-wiz-rule relative space-y-3 border border-[#ECE9E4] bg-white p-4 pt-5"
        >
          <p class="text-sm font-extrabold text-brand-navy">
            {{ t('owner.seasonPage.sessionRuleN', { n: formatFaDigits(String(ruleIndex + 1)) }) }}
          </p>
          <button
            v-if="rules.length > 1"
            type="button"
            class="absolute top-4 end-4 text-xs font-bold text-[#8C8A84] bg-[#F5F3EF] px-3 py-1"
            @click="removeRule(rule.id)"
          >
            {{ t('common.remove') }}
          </button>
          <div>
            <p class="mb-2 text-xs font-bold text-[#55534E]">{{ t('owner.packagesPage.weekdays') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="day in IRAN_WEEKDAY_ORDER"
                :key="`${rule.id}-${day}`"
                type="button"
                class="season-wiz-chip"
                :class="rule.weekdays.includes(day) ? 'is-on' : ''"
                :aria-pressed="rule.weekdays.includes(day)"
                @click="toggleWeekday(rule, day)"
              >
                {{ t(`owner.weekdaysShort.${day}`) }}
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
            <p class="mb-2 text-xs font-bold text-[#55534E]">{{ t('owner.seasonPage.courtsLabel') }}</p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                v-for="court in courts"
                :key="`${rule.id}-${court.id}`"
                type="button"
                class="season-wiz-fcard text-start"
                :class="rule.courtIds.includes(court.id) ? 'is-on' : ''"
                :aria-pressed="rule.courtIds.includes(court.id)"
                @click="toggleCourt(rule, court.id)"
              >
                <span class="block text-[13.5px] font-bold">{{ courtLabel(court) }}</span>
                <span class="block text-[11.5px] text-[#8C8A84]">
                  {{ court.price != null ? t('owner.seasonPage.courtPricePerSession', { price: formatCurrency(court.price) }) : '—' }}
                </span>
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="season-wiz-add-rule w-full" @click="addRule()">
          {{ t('owner.seasonPage.addRule') }}
        </button>
        <p v-if="localExpandCount" class="text-start text-xs text-[#8C8A84]">
          {{ t('owner.seasonPage.expandHint', { count: formatNumber(localExpandCount) }) }}
        </p>
        <div class="season-wiz-actions flex flex-wrap gap-3 border-t border-[#ECE9E4] pt-5">
          <button type="button" class="season-wiz-btn season-wiz-btn-ghost" @click="goStep(1)">
            {{ t('common.back') }}
          </button>
          <span class="flex-1" />
          <button
            type="button"
            class="season-wiz-btn season-wiz-btn-primary"
            :disabled="previewing || !rulesValid()"
            @click="runPreview"
          >
            {{ previewing ? t('common.loading') : t('owner.seasonPage.preview') }}
          </button>
        </div>
      </div>

      <!-- Step 3 -->
      <div v-show="step === 3" class="space-y-4">
        <div class="season-wiz-strip grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div>
            <span>{{ t('owner.seasonPage.stripPlayer') }}</span>
            <b>{{ guestFullName.trim() || '—' }}</b>
          </div>
          <div>
            <span>{{ t('owner.guestMobile') }}</span>
            <b dir="ltr" class="tabular-nums">{{ guestMobile ? formatPhone(guestMobile) : '—' }}</b>
          </div>
          <div>
            <span>{{ t('owner.seasonPage.stripRange') }}</span>
            <b>{{ startDate && finishDate ? `${formatDate(startDate)} – ${formatDate(finishDate)}` : '—' }}</b>
          </div>
          <div>
            <span>{{ t('owner.seasonPage.stripRules') }}</span>
            <b>{{ t('owner.seasonPage.rulesCount', { count: formatNumber(rules.length) }) }}</b>
          </div>
        </div>

        <div
          class="season-wiz-banner"
          :class="`is-${step3Banner.tone}`"
          aria-live="polite"
        >
          {{ step3Banner.text }}
        </div>
        <p class="text-start text-xs text-[#8C8A84]">{{ t('owner.seasonPage.conflictSoftHint') }}</p>

        <div class="max-h-72 space-y-2 overflow-y-auto">
          <div
            v-for="(item, idx) in sessionList"
            :key="item.kind === 'free'
              ? `f-${item.row.courtId}-${item.row.date}-${item.row.startTime}-${item.index}`
              : `c-${item.row.courtId || ''}-${item.row.date}-${item.row.startTime}-${idx}`"
            class="season-wiz-session flex flex-wrap items-center gap-3"
            :class="item.kind === 'conflict' ? 'is-conf' : ''"
          >
            <span class="season-wiz-s-field">
              {{ courtNameById(item.kind === 'free' ? item.row.courtId : (item.row.courtId || '')) }}
            </span>
            <span class="text-[13.5px] font-semibold">
              {{ formatDate(item.row.date) }}
            </span>
            <span class="text-[13px] text-[#55534E]">
              <bdi dir="ltr">{{ formatTimeLabel(item.row.startTime) }}</bdi>
            </span>
            <span
              class="season-wiz-badge"
              :class="item.kind === 'free' ? 'is-ok' : 'is-conf'"
            >
              {{ item.kind === 'free'
                ? t('owner.seasonPage.badgeFree')
                : t('owner.seasonPage.badgeConflict', {
                  reason: t(`owner.seasonPage.conflictReason.${item.row.reason}`),
                }) }}
            </span>
            <span v-if="item.kind === 'free' && item.row.price != null" class="ms-auto text-[14.5px] font-extrabold">
              {{ formatCurrency(item.row.price) }}
            </span>
            <button
              v-if="item.kind === 'free'"
              type="button"
              class="shrink-0 text-xs font-bold text-brand-primary"
              @click="removeOccurrence(item.index)"
            >
              {{ t('common.remove') }}
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 border-t border-dashed border-[#E0DDD6] pt-4">
          <span class="text-sm font-semibold text-[#55534E]">{{ t('owner.seasonPage.totalFree') }}</span>
          <b class="text-[21px] font-extrabold tabular-nums">{{ formatCurrency(totalAmount) }}</b>
        </div>
        <p class="text-start text-xs text-[#8C8A84]">{{ t('owner.seasonPage.onePaymentHint') }}</p>

        <div class="season-wiz-actions flex flex-wrap gap-3 border-t border-[#ECE9E4] pt-5">
          <button type="button" class="season-wiz-btn season-wiz-btn-ghost" :disabled="saving" @click="goStep(2)">
            {{ t('common.back') }}
          </button>
          <span class="flex-1" />
          <button
            type="button"
            class="season-wiz-btn season-wiz-btn-primary"
            :disabled="saving || !occurrences.length"
            @click="confirmReserve('cash')"
          >
            {{ saving ? t('common.loading') : t('owner.payCash') }}
          </button>
          <button
            type="button"
            class="season-wiz-btn season-wiz-btn-dark"
            :disabled="saving || !occurrences.length"
            @click="confirmReserve('unpaid')"
          >
            {{ saving ? t('common.loading') : (payAtClubMode ? t('owner.reserveUnpaid') : t('owner.sendPayLink')) }}
          </button>
        </div>
      </div>
    </section>

    <AppModal :open="successOpen" :title="successTitle" max-width-class="max-w-md" @close="successOpen = false">
      <p class="text-start text-sm text-[#55534E] leading-7">{{ successBody }}</p>
      <div class="mt-5 flex flex-col gap-2 sm:flex-row">
        <button type="button" class="season-wiz-btn season-wiz-btn-primary flex-1" @click="successOpen = false">
          {{ t('common.close') }}
        </button>
        <NuxtLink
          :to="localePath('/owner/calendar')"
          class="season-wiz-btn season-wiz-btn-ghost flex-1 inline-flex items-center justify-center"
          @click="successOpen = false"
        >
          {{ t('owner.reserveRedirect.cta') }}
        </NuxtLink>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.season-wiz {
  background: transparent;
}
.season-wiz-card {
  border: 1px solid #ECE9E4;
  border-radius: 0;
  background: #fff;
  box-shadow: 0 1px 2px rgba(31, 31, 29, 0.04), 0 10px 28px -16px rgba(31, 31, 29, 0.14);
}
.season-wiz-steps {
  scrollbar-width: none;
}
.season-wiz-steps::-webkit-scrollbar {
  display: none;
}
.season-wiz-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: #8C8A84;
  white-space: nowrap;
  border-radius: 0;
}
.season-wiz-step:disabled {
  cursor: default;
}
.season-wiz-step-num {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 700;
  background: #F1EFEA;
  color: #8C8A84;
  border-radius: 0;
}
.season-wiz-step.is-active {
  background: #FDEDEE;
  color: #C0141F;
}
.season-wiz-step.is-active .season-wiz-step-num {
  background: #E02330;
  color: #fff;
}
.season-wiz-step.is-done {
  color: #1D5C3F;
  cursor: pointer;
}
.season-wiz-step.is-done:hover {
  background: #E8F3EC;
}
.season-wiz-step.is-done .season-wiz-step-num {
  background: #E8F3EC;
  color: #1D5C3F;
}
.season-wiz-range-box {
  background: #FAF9F6;
  border: 1px dashed #E0DDD6;
  padding: 14px 16px;
  border-radius: 0;
}
.season-wiz-lg {
  width: 10px;
  height: 10px;
  display: inline-block;
}
.season-wiz-lg-edge {
  background: #1D5C3F;
}
.season-wiz-lg-in {
  background: #E8F3EC;
  border: 1px solid #CFE5D8;
}
.season-wiz-chip {
  min-width: 42px;
  height: 40px;
  border: 1px solid #E0DDD6;
  background: #fff;
  font-weight: 700;
  color: #55534E;
  border-radius: 0;
}
.season-wiz-chip.is-on {
  background: #E8F3EC;
  border-color: #1D5C3F;
  color: #1D5C3F;
}
.season-wiz-fcard {
  border: 1.5px solid #E0DDD6;
  padding: 11px 14px;
  border-radius: 0;
  background: #fff;
}
.season-wiz-fcard.is-on {
  border-color: #E02330;
  background: #FDEDEE;
}
.season-wiz-fcard.is-on span:last-child {
  color: #C0141F;
}
.season-wiz-add-rule {
  height: 48px;
  border: 1.5px dashed #E0DDD6;
  color: #55534E;
  font-weight: 700;
  font-size: 14px;
  border-radius: 0;
  background: transparent;
}
.season-wiz-add-rule:hover {
  border-color: #E02330;
  color: #C0141F;
  background: #FDEDEE;
}
.season-wiz-strip > div {
  background: #FAF9F6;
  border: 1px solid #ECE9E4;
  padding: 10px 14px;
  min-width: 0;
  border-radius: 0;
}
.season-wiz-strip span {
  display: block;
  font-size: 11.5px;
  color: #8C8A84;
}
.season-wiz-strip b {
  display: block;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.season-wiz-banner {
  padding: 13px 16px;
  font-weight: 700;
  font-size: 14px;
  line-height: 1.7;
  border: 1px solid transparent;
  border-radius: 0;
}
.season-wiz-banner.is-ok {
  background: #E8F3EC;
  color: #1D5C3F;
  border-color: #CFE5D8;
}
.season-wiz-banner.is-warn {
  background: #FBF1DE;
  color: #95590A;
  border-color: #F1E1C0;
}
.season-wiz-banner.is-err {
  background: #FDEDEE;
  color: #C0141F;
  border-color: #F8D8DA;
}
.season-wiz-session {
  padding: 12px 16px;
  border: 1px solid #ECE9E4;
  background: #FAF9F6;
  border-radius: 0;
}
.season-wiz-session.is-conf {
  opacity: 0.65;
  background: #FCF6F6;
  border-color: #F8D8DA;
  text-decoration: line-through;
}
.season-wiz-s-field {
  font-weight: 700;
  font-size: 12.5px;
  background: #F1EFEA;
  padding: 4px 10px;
  flex: none;
  border-radius: 0;
}
.season-wiz-badge {
  font-size: 11.5px;
  font-weight: 700;
  padding: 4px 11px;
  flex: none;
  border-radius: 0;
}
.season-wiz-badge.is-ok {
  background: #E8F3EC;
  color: #1D5C3F;
}
.season-wiz-badge.is-conf {
  background: #FDEDEE;
  color: #C0141F;
}
.season-wiz-btn {
  height: 46px;
  padding: 0 22px;
  font-weight: 700;
  font-size: 14.5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}
.season-wiz-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.season-wiz-btn-primary {
  background: #E02330;
  color: #fff;
}
.season-wiz-btn-primary:hover:not(:disabled) {
  background: #C0141F;
}
.season-wiz-btn-dark {
  background: #1F1F1D;
  color: #fff;
}
.season-wiz-btn-outline {
  background: #fff;
  color: #C0141F;
  border: 1.5px solid #E02330;
}
.season-wiz-btn-ghost {
  background: transparent;
  color: #55534E;
}
.season-wiz-btn-ghost:hover:not(:disabled) {
  background: #F1EFEA;
}
</style>
