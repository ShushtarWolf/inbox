<script setup lang="ts">
import { addDaysToIsoDate, isSlotStartInPast } from '#shared/localDate.ts'
import { weekdayKeyFromDayOfWeek } from '#shared/recurringSessions.ts'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

type ScheduleSession = {
  id: string
  startTime: string
  endTime: string
  status: string
  paymentStatus: string
  athlete: { name: string; phone: string }
}

type SchedulePayload = {
  date: string
  dayOfWeek: number
  windows: Array<{ id: string; startTime: string; endTime: string }>
  sessions: ScheduleSession[]
  freeSlots: Array<{ startTime: string; endTime: string }>
  weeklyAvailability: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>
}

type HourRow =
  | { kind: 'booked'; startTime: string; endTime: string; session: ScheduleSession }
  | { kind: 'free'; startTime: string; endTime: string; past: boolean }
  | { kind: 'past'; startTime: string; endTime: string }
  | { kind: 'closed'; startTime: string; endTime: string }

const { t } = useI18n()
const localePath = useLocalePath()
const { today } = useLocalDate()
const { formatDayNumber, formatWeekday, formatMonth, formatTimeLabel, formatTimeRange, formatPhone } = useFormatters()

const date = ref(today())
const showDatePicker = ref(false)

const query = computed(() => ({ date: date.value }))
const { data, pending, error } = await useAuthedFetch<SchedulePayload>('/api/coach/schedule', {
  query,
  watch: [query],
})

const dateNavLabel = computed(() => {
  const d = date.value
  return `${formatWeekday(d)} | ${formatDayNumber(d)} ${formatMonth(d)}`
})

const isToday = computed(() => date.value === today())

const hourRows = computed<HourRow[]>(() => {
  const payload = data.value
  if (!payload) return []

  const bookedByStart = new Map(payload.sessions.map((session) => [session.startTime.slice(0, 5), session]))
  const freeStarts = new Set(payload.freeSlots.map((slot) => slot.startTime.slice(0, 5)))

  const hours = new Set<string>()
  for (const window of payload.windows) {
    const startHour = Number(window.startTime.split(':')[0] || 0)
    const endHour = Number(window.endTime.split(':')[0] || 0)
    for (let hour = startHour; hour < endHour; hour++) {
      hours.add(`${String(hour).padStart(2, '0')}:00`)
    }
  }
  for (const session of payload.sessions) {
    hours.add(session.startTime.slice(0, 5))
  }
  for (const slot of payload.freeSlots) {
    hours.add(slot.startTime.slice(0, 5))
  }

  return [...hours].sort().map((startTime) => {
    const endTime = `${String((Number(startTime.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`
    const session = bookedByStart.get(startTime)
    if (session) {
      return { kind: 'booked' as const, startTime, endTime: session.endTime.slice(0, 5), session }
    }
    if (freeStarts.has(startTime)) {
      return {
        kind: 'free' as const,
        startTime,
        endTime,
        past: isSlotStartInPast(payload.date, startTime),
      }
    }
    if (isSlotStartInPast(payload.date, startTime)) {
      return { kind: 'past' as const, startTime, endTime }
    }
    return { kind: 'closed' as const, startTime, endTime }
  })
})

function weekdayLabel(dayOfWeek: number) {
  return t(`owner.weekdays.${weekdayKeyFromDayOfWeek(dayOfWeek)}`)
}

function shiftDate(delta: number) {
  date.value = addDaysToIsoDate(date.value, delta)
}

function goToday() {
  date.value = today()
  showDatePicker.value = false
}

function closeDatePicker() {
  showDatePicker.value = false
}

function cellClass(row: HourRow) {
  if (row.kind === 'booked') return 'slot-reserved-cash'
  if (row.kind === 'free') return row.past ? 'slot-past' : 'slot-free'
  if (row.kind === 'past') return 'slot-past'
  return 'slot-closed'
}

function barClass(row: HourRow) {
  if (row.kind === 'booked') return 'canva-cal-grid-cell-bar-reserved-cash'
  if (row.kind === 'free') {
    return row.past ? 'canva-cal-grid-cell-bar-blocked' : 'canva-cal-grid-cell-bar-free coach-cal-bar-free'
  }
  if (row.kind === 'past') return 'canva-cal-grid-cell-bar-blocked'
  return 'canva-cal-grid-cell-bar-blocked'
}

function bookLinkFor(startTime: string) {
  return localePath({ path: '/coach/book', query: { date: date.value, time: startTime } })
}
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex items-center justify-between gap-3">
      <h1 class="tail-page-title mb-0">{{ $t('coach.schedule') }}</h1>
      <button
        v-if="!isToday"
        type="button"
        class="text-sm font-bold text-brand-primary"
        @click="goToday"
      >
        {{ $t('calendar.today') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="canva-cal-grid-shell ios-card overflow-hidden p-3">
        <div class="canva-cal-date-nav">
          <div class="canva-cal-date-nav-center">
            <button
              type="button"
              class="canva-cal-date-nav-btn"
              :aria-label="$t('calendar.prevMonth')"
              @click="shiftDate(-1)"
            >
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <button
              type="button"
              class="canva-cal-date-nav-label"
              :aria-label="$t('owner.pickDate')"
              @click="showDatePicker = true"
            >
              {{ dateNavLabel }}
            </button>
            <button
              type="button"
              class="canva-cal-date-nav-btn"
              :aria-label="$t('calendar.nextMonth')"
              @click="shiftDate(1)"
            >
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
        </div>

        <div class="mb-3 flex flex-wrap gap-3 text-[10px] font-bold text-brand-gray-600">
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2.5 w-1 bg-[#C41E1E]" />
            {{ $t('coach.scheduleLegendBooked') }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2.5 w-1 bg-[#3B82F6]" />
            {{ $t('coach.scheduleLegendFree') }}
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2.5 w-1 bg-brand-gray-400" />
            {{ $t('coach.scheduleLegendPast') }}
          </span>
        </div>

        <div v-if="hourRows.length" class="canva-cal-grid-scroll">
          <div
            class="canva-cal-grid"
            style="grid-template-columns: var(--canva-cal-gutter, 2.75rem) minmax(0, 1fr)"
          >
            <template v-for="row in hourRows" :key="row.startTime">
              <div class="canva-cal-grid-time">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(row.startTime) }}</bdi>
              </div>
              <NuxtLink
                v-if="row.kind === 'free'"
                :to="bookLinkFor(row.startTime)"
                class="canva-cal-grid-cell"
                :class="cellClass(row)"
              >
                <span class="canva-cal-grid-cell-bar" :class="barClass(row)" />
                <div class="canva-cal-grid-cell-body">
                  <p class="canva-cal-grid-cell-label">
                    {{ row.past ? $t('coach.schedulePastSlot') : $t('coach.scheduleFreeSlot') }}
                  </p>
                  <p class="canva-cal-grid-cell-sub">{{ $t('coach.scheduleBookCta') }}</p>
                </div>
              </NuxtLink>
              <div
                v-else
                class="canva-cal-grid-cell"
                :class="cellClass(row)"
              >
                <span class="canva-cal-grid-cell-bar" :class="barClass(row)" />
                <div class="canva-cal-grid-cell-body">
                  <template v-if="row.kind === 'booked'">
                    <p class="canva-cal-grid-cell-label">{{ row.session.athlete.name }}</p>
                    <p class="canva-cal-grid-cell-sub">
                      <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(row.session.startTime, row.session.endTime) }}</bdi>
                      · <bdi dir="ltr" class="tabular-nums">{{ formatPhone(row.session.athlete.phone) }}</bdi>
                    </p>
                  </template>
                  <template v-else-if="row.kind === 'past'">
                    <p class="canva-cal-grid-cell-label">{{ $t('coach.schedulePastSlot') }}</p>
                  </template>
                  <template v-else>
                    <p class="canva-cal-grid-cell-label">{{ $t('coach.scheduleClosedSlot') }}</p>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="border border-dashed border-brand-gray-100 p-4 text-sm text-brand-gray-600">
          <p>{{ $t('coach.scheduleEmptyDay') }}</p>
          <NuxtLink
            :to="localePath('/coach/profile')"
            class="mt-2 inline-block text-sm font-bold text-brand-primary"
          >
            {{ $t('coach.scheduleEditAvailability') }}
          </NuxtLink>
        </div>
      </div>

      <section class="ios-card space-y-2 p-4">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-bold text-brand-navy">{{ $t('coaches.availability') }}</h2>
          <NuxtLink :to="localePath('/coach/profile')" class="text-xs font-bold text-brand-primary">
            {{ $t('common.edit') }}
          </NuxtLink>
        </div>
        <div
          v-if="data?.weeklyAvailability?.length"
          class="overflow-hidden border border-brand-gray-100"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 bg-brand-gray-50 text-xs text-brand-gray-600">
                <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityDay') }}</th>
                <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityHours') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in data.weeklyAvailability"
                :key="item.id"
                class="border-b border-brand-gray-100 last:border-b-0"
              >
                <td class="px-3 py-2 font-medium text-brand-navy">{{ weekdayLabel(item.dayOfWeek) }}</td>
                <td class="px-3 py-2 tabular-nums">
                  <bdi dir="ltr">{{ formatTimeRange(item.startTime, item.endTime) }}</bdi>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs text-brand-gray-600">{{ $t('coach.noAvailability') }}</p>
      </section>
    </AppAsyncState>

    <AppModal
      :open="showDatePicker"
      patterned
      close-icon
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeDatePicker"
    >
      <div class="p-4">
        <AppJalaliCalendar
          v-model="date"
          @select="closeDatePicker"
        />
        <button type="button" class="btn-secondary mt-3 w-full" @click="goToday">
          {{ $t('calendar.today') }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
