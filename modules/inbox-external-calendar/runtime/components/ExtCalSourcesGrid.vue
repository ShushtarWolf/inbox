<script setup lang="ts">
import { addDaysToIsoDate } from '#shared/localDate.ts'

interface SourceDetail {
  source: string
  siteLabel: string
  externalClubTitle: string | null
}

interface CalendarSourcesCourt {
  id: string
  nameFa: string
  nameEn: string
}

interface CalendarSourcesCell {
  courtId: string
  startTime: string
  inboxStatus: string
  sources: string[]
  badge: string
  occupied: boolean
  sourceDetails?: SourceDetail[]
}

interface CalendarSourcesAdapter {
  source: string
  siteLabel: string
  supported: boolean
  error: string | null
  slotCount: number
  externalClubTitle: string | null
}

export interface CalendarSourcesPayload {
  date: string
  clubSlug: string
  mapped: boolean
  mappingLabel: string | null
  message: string | null
  courts: CalendarSourcesCourt[]
  cells: CalendarSourcesCell[]
  pollIntervalMs: number
  adapters: CalendarSourcesAdapter[]
}

const props = defineProps<{
  data: CalendarSourcesPayload | null
  pending: boolean
  error: unknown
  date: string
  showClubSlug?: boolean
}>()

const emit = defineEmits<{
  'update:date': [value: string]
  refresh: []
}>()

const { t, locale } = useI18n()
const { localizedField } = useLocalizedField()

const courts = computed(() => props.data?.courts || [])

const hours = computed(() => {
  const set = new Set<string>()
  for (const cell of props.data?.cells || []) set.add(cell.startTime)
  return [...set].sort()
})

const gridTemplateColumns = computed(() => {
  const courtCount = Math.max(courts.value.length, 1)
  return `var(--canva-cal-gutter, 2.75rem) repeat(${courtCount}, minmax(var(--canva-cal-court-min, 5.5rem), 1fr))`
})

function cellFor(courtId: string, startTime: string) {
  return (props.data?.cells || []).find((cell) => cell.courtId === courtId && cell.startTime === startTime)
}

function cellClass(cell: CalendarSourcesCell | undefined) {
  if (!cell?.occupied) return 'canva-cal-grid-cell-bar-free'
  if (cell.sources.length > 1) return 'canva-cal-grid-cell-bar-pending'
  if (cell.sources.includes('inbox')) return 'canva-cal-grid-cell-bar-reserved-cash'
  return 'canva-cal-grid-cell-bar-blocked'
}

function shiftDate(delta: number) {
  emit('update:date', addDaysToIsoDate(props.date, delta))
}

const formattedDate = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tehran',
      ...(locale.value === 'fa' ? { calendar: 'persian', numberingSystem: 'arabext' } : {}),
    }).format(new Date(`${props.date}T12:00:00`))
  } catch {
    return props.date
  }
})

function sourceDetailLine(detail: SourceDetail) {
  if (detail.externalClubTitle) return `${detail.siteLabel}: ${detail.externalClubTitle}`
  return detail.siteLabel
}
</script>

<template>
  <div class="space-y-4">
    <section class="space-y-3 px-4">
      <p class="text-sm leading-6 text-brand-navy/80">
        نمای مرجع برای مقایسه اشغال اینباکس با سایت‌های دیگر (فقط خواندن).
      </p>

      <p v-if="showClubSlug && data?.clubSlug" class="text-xs text-brand-navy/70" dir="ltr">
        {{ data.clubSlug }}
      </p>

      <p
        v-if="data?.message"
        class="rounded-sm border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy"
      >
        {{ data.message }}
      </p>

      <p
        v-else-if="data?.mapped"
        class="rounded-sm border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-sm text-brand-navy"
      >
        باشگاه «{{ data.mappingLabel || data.clubSlug }}» در فایل mapping ثبت شده است.
      </p>

      <div v-if="data?.adapters?.length" class="space-y-1 text-xs text-brand-navy/70">
        <p v-for="adapter in data.adapters" :key="adapter.source">
          {{ adapter.siteLabel }}<span v-if="adapter.externalClubTitle"> — {{ adapter.externalClubTitle }}</span>:
          <span v-if="!adapter.supported">پشتیبانی نمی‌شود</span>
          <span v-else-if="adapter.error">{{ adapter.error }}</span>
          <span v-else>{{ adapter.slotCount }} سلول خارجی</span>
        </p>
      </div>
    </section>

    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <div class="canva-cal-grid-shell">
        <div class="canva-cal-date-nav">
          <div class="canva-cal-date-nav-center">
            <button type="button" class="canva-cal-date-nav-btn" aria-label="روز قبل" @click="shiftDate(-1)">
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <span class="canva-cal-date-nav-label">{{ formattedDate }}</span>
            <button type="button" class="canva-cal-date-nav-btn" aria-label="روز بعد" @click="shiftDate(1)">
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
        </div>

        <div class="canva-cal-body">
          <p v-if="pending && !data" class="px-4 py-8 text-center text-sm text-brand-navy/70">
            {{ t('common.loading') }}
          </p>
          <p v-else-if="error" class="px-4 py-8 text-center text-sm text-red-700">
            {{ t('errors.generic') }}
          </p>
          <div v-else class="canva-cal-grid-scroll">
            <div class="canva-cal-grid" :style="{ gridTemplateColumns }">
              <div class="canva-cal-grid-corner" />
              <div v-for="court in courts" :key="court.id" class="canva-cal-grid-court">
                {{ localizedField(court, 'nameFa', 'nameEn') }}
              </div>

              <template v-for="hour in hours" :key="hour">
                <div class="canva-cal-grid-time">{{ hour }}</div>
                <div v-for="court in courts" :key="`${court.id}-${hour}`" class="canva-cal-grid-cell">
                  <div class="canva-cal-grid-cell-bar" :class="cellClass(cellFor(court.id, hour))">
                    <span
                      v-if="cellFor(court.id, hour)?.badge"
                      class="block px-1 text-[10px] font-bold leading-tight text-white"
                    >
                      {{ cellFor(court.id, hour)?.badge }}
                    </span>
                    <span
                      v-for="detail in cellFor(court.id, hour)?.sourceDetails || []"
                      :key="detail.source"
                      class="canva-ext-cal-source-detail"
                    >
                      {{ sourceDetailLine(detail) }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <p class="canva-cal-legend-note px-4 pt-2 text-xs text-brand-navy/70">
        بروزرسانی خودکار هر {{ Math.round((data?.pollIntervalMs || 25000) / 1000) }} ثانیه.
      </p>
    </div>
  </div>
</template>
