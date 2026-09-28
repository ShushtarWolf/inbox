<script setup lang="ts">
import {
  PERSIAN_MONTHS,
  isoToJalaali,
  jalaaliDaysInMonth,
  jalaaliToIso,
} from '#shared/jalali.ts'
import { seasonCalendarMonths, seasonScheduleRows } from '#shared/seasonReceipt.ts'

type Session = {
  iso?: string
  date: string
  startTime: string
  endTime: string
  courtName: string
  price: number
}

const props = defineProps<{
  notice?: string
  data: {
    trackingCode: string
    guestName: string
    mobile: string
    clubName: string
    clubAddress?: string
    clubPhone?: string
    paymentMethod: string
    sessions?: Session[]
    session: Session
    amount: number
    clubImage?: string | null
    amenities?: string[]
    policies?: { title: string; body: string }[]
    cancellationWindowHours?: number
    rescheduleWindowHours?: number
  }
}>()

const { t } = useI18n()
const { formatCurrency, formatPhone, formatNumber, formatYear, formatTimeLabel } = useFormatters()
const { today } = useLocalDate()

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

const sessions = computed(() => {
  if (props.data.sessions?.length) return props.data.sessions
  return props.data.session ? [props.data.session] : []
})

const courts = computed(() => {
  const names = sessions.value.map((session) => session.courtName.trim()).filter(Boolean)
  return [...new Set(names)]
})

const schedule = computed(() => seasonScheduleRows(sessions.value.map((session) => ({
  iso: session.iso || '',
  startTime: session.startTime,
  endTime: session.endTime,
  courtName: session.courtName,
}))))

const months = computed(() => seasonCalendarMonths(sessions.value.map((session) => session.iso)))
const monthIndex = ref(0)

watch(months, (list) => {
  const now = isoToJalaali(today())
  const index = list.findIndex((month) => month.year === now.jy && month.month === now.jm)
  monthIndex.value = index >= 0 ? index : 0
}, { immediate: true })

const view = computed(() => months.value[monthIndex.value] || null)

const sessionDays = computed(() => new Set(sessions.value.map((session) => session.iso).filter((iso): iso is string => Boolean(iso))))

const calendarCells = computed(() => {
  const month = view.value
  if (!month) return [] as Array<{ day: number | null; iso: string | null }>
  const daysInMonth = jalaaliDaysInMonth(month.year, month.month)
  const parts = jalaaliToIso(month.year, month.month, 1).split('-').map(Number)
  const weekday = new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1).getDay()
  const leadingBlanks = (weekday + 1) % 7
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: jalaaliToIso(month.year, month.month, day) })
  }
  return cells
})

const monthLabel = computed(() => {
  const month = view.value
  if (!month) return ''
  return `${PERSIAN_MONTHS[month.month - 1] || ''} ${formatYear(month.year)}`
})

const initial = computed(() => props.data.guestName.trim().charAt(0) || '؟')

const paidLabel = computed(() => {
  const method = props.data.paymentMethod || ''
  if (method.includes('نقدی') || /cash/i.test(method)) return t('booking.receiptBadgeCash')
  return t('booking.receiptBadgePaid')
})

const rules = computed(() => {
  const lines = [...(props.data.policies || [])]
  const cancel = props.data.cancellationWindowHours
  const move = props.data.rescheduleWindowHours
  if (typeof cancel === 'number' && cancel >= 0) {
    lines.push({ title: '', body: t('booking.receiptCancelRule', { hours: formatNumber(cancel) }) })
  }
  if (typeof move === 'number' && move >= 0) {
    lines.push({ title: '', body: t('booking.receiptRescheduleRule', { hours: formatNumber(move) }) })
  }
  return lines.filter((line) => line.title || line.body)
})

function timeLabel(start: string, end: string) {
  if (end && end !== start) return `${formatTimeLabel(start)} تا ${formatTimeLabel(end)}`
  return formatTimeLabel(start)
}

function cellClass(iso: string | null) {
  if (!iso) return ''
  const classes: string[] = []
  const booked = sessionDays.value.has(iso)
  if (booked && iso < today()) classes.push('is-past')
  if (booked && iso >= today()) classes.push('is-upcoming')
  if (iso === today()) classes.push('is-today')
  return classes.join(' ')
}
</script>

<template>
  <div class="season-receipt">
    <div class="season-banner">
      <img
        v-if="data.clubImage"
        :src="data.clubImage"
        alt=""
        class="season-banner-media pointer-events-none"
      >
      <div class="season-banner-wash pointer-events-none" />
      <div class="season-banner-top">
        <b dir="ltr">Inbox</b>
      </div>
      <div class="season-banner-bottom">
        <h1>{{ data.clubName }}</h1>
        <p v-if="data.clubAddress">{{ data.clubAddress }}</p>
      </div>
    </div>

    <div class="season-content">
      <p v-if="notice" class="season-notice">{{ notice }}</p>

      <section class="season-card">
        <div class="season-id">
          <span class="season-avatar" aria-hidden="true">{{ initial }}</span>
          <div>
            <h2>{{ data.guestName || t('booking.receiptGreetingFallback') }}</h2>
            <p v-if="data.mobile">
              <bdi dir="ltr" class="tabular-nums">{{ formatPhone(data.mobile) }}</bdi>
            </p>
          </div>
        </div>
        <div v-if="courts.length" class="season-badges">
          <span v-for="court in courts" :key="court" class="season-badge">{{ court }}</span>
        </div>
      </section>

      <section class="season-card">
        <div class="season-hd">
          <AppIcon name="receipt_long" size="sm" />
          <h3>{{ t('booking.receiptTitle') }}</h3>
        </div>
        <div class="season-row">
          <span>{{ t('booking.receiptTracking') }}</span>
          <bdi dir="ltr" class="tabular-nums">{{ data.trackingCode }}</bdi>
        </div>
        <div class="season-row">
          <span>{{ t('booking.receiptPaidAmount') }}</span>
          <b class="tabular-nums">{{ formatCurrency(data.amount) }}</b>
        </div>
        <div class="season-row">
          <span>{{ t('booking.receiptPayMethod') }}</span>
          <b>{{ data.paymentMethod }}</b>
        </div>
        <div class="season-paid">
          <span class="season-badge is-paid">{{ paidLabel }}</span>
        </div>
      </section>

      <section v-if="schedule.length" class="season-card">
        <div class="season-hd">
          <AppIcon name="event_repeat" size="sm" />
          <h3>{{ t('booking.receiptSchedule') }}</h3>
        </div>
        <div v-for="(row, index) in schedule" :key="`${row.weekday}-${row.startTime}-${index}`" class="season-slot">
          <AppIcon name="schedule" size="sm" />
          <div>
            <h4>{{ row.weekday }}</h4>
            <p>
              <bdi dir="ltr" class="tabular-nums">{{ timeLabel(row.startTime, row.endTime) }}</bdi>
              <template v-if="courts.length > 1 && row.courtName"> · {{ row.courtName }}</template>
            </p>
          </div>
        </div>
      </section>

      <section v-if="view" class="season-card">
        <div class="season-hd">
          <AppIcon name="calendar_month" size="sm" />
          <h3>{{ t('booking.receiptCalendar') }}</h3>
        </div>
        <div class="season-cal-nav">
          <button
            type="button"
            :disabled="monthIndex <= 0"
            :aria-label="t('calendar.prevMonth')"
            @click="monthIndex -= 1"
          >
            <AppIcon name="chevron_right" size="sm" />
          </button>
          <b>{{ monthLabel }}</b>
          <button
            type="button"
            :disabled="monthIndex >= months.length - 1"
            :aria-label="t('calendar.nextMonth')"
            @click="monthIndex += 1"
          >
            <AppIcon name="chevron_left" size="sm" />
          </button>
        </div>
        <div class="season-cal-head">
          <span v-for="weekday in PERSIAN_WEEKDAYS" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="season-cal-grid">
          <span
            v-for="(cell, index) in calendarCells"
            :key="cell.iso || `blank-${index}`"
            class="season-cal-cell"
            :class="cell.iso ? cellClass(cell.iso) : 'is-empty'"
          >{{ cell.day ? formatNumber(cell.day) : '' }}</span>
        </div>
        <div class="season-legend">
          <span><i class="is-past" />{{ t('booking.receiptPastSession') }}</span>
          <span><i class="is-upcoming" />{{ t('booking.receiptUpcomingSession') }}</span>
          <span><i class="is-today" />{{ t('booking.receiptToday') }}</span>
        </div>
      </section>

      <section class="season-card">
        <div class="season-hd">
          <AppIcon name="apartment" size="sm" />
          <h3>{{ t('booking.receiptClubInfo') }}</h3>
        </div>
        <div class="season-club">
          <img v-if="data.clubImage" :src="data.clubImage" alt="" class="pointer-events-none">
          <div>
            <h4>{{ data.clubName }}</h4>
            <p v-if="data.clubAddress">{{ data.clubAddress }}</p>
            <p v-if="data.clubPhone">
              <bdi dir="ltr" class="tabular-nums">{{ formatPhone(data.clubPhone) }}</bdi>
            </p>
          </div>
        </div>
        <div v-if="data.amenities?.length" class="season-amenities">
          <span v-for="item in data.amenities" :key="item">{{ item }}</span>
        </div>
      </section>

      <section v-if="rules.length" class="season-card">
        <div class="season-hd">
          <AppIcon name="privacy_tip" size="sm" />
          <h3>{{ t('booking.receiptRules') }}</h3>
        </div>
        <div v-for="(rule, index) in rules" :key="`${rule.title}-${index}`" class="season-rule">
          <AppIcon name="circle" size="sm" />
          <span>
            <b v-if="rule.title">{{ rule.title }}{{ rule.body ? ': ' : '' }}</b>{{ rule.body }}
          </span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.season-receipt {
  max-width: 420px;
  margin: 0 auto;
  min-height: 100dvh;
  background: #fafaf7;
  color: #201e1b;
  letter-spacing: 0;
}
.season-banner {
  position: relative;
  height: 190px;
  background: #201e1b;
  overflow: hidden;
}
.season-banner-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.season-banner-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(32, 30, 27, 0.1), rgba(32, 30, 27, 0.82));
}
.season-banner-top,
.season-banner-bottom {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 1;
  color: #fff;
}
.season-banner-top {
  top: 0;
  display: flex;
  justify-content: flex-start;
  padding: 16px;
}
.season-banner-top b {
  font-size: 16px;
  font-weight: 700;
}
.season-banner-bottom {
  bottom: 14px;
  padding: 0 18px;
}
.season-banner-bottom h1 {
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 4px;
}
.season-banner-bottom p {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: #e6e4e1;
}
.season-content {
  padding: 18px;
}
.season-notice {
  margin-bottom: 14px;
  font-size: 13px;
  text-align: start;
}
.season-card {
  background: #fff;
  border: 1px solid rgba(32, 30, 27, 0.1);
  padding: 18px;
  margin-bottom: 14px;
  border-radius: 0;
}
.season-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: #c41e1e;
}
.season-hd h3 {
  font-size: 12.5px;
  font-weight: 700;
  color: #201e1b;
}
.season-id {
  display: flex;
  align-items: center;
  gap: 12px;
}
.season-avatar {
  width: 44px;
  height: 44px;
  background: #c41e1e;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.season-id h2 {
  font-size: 14.5px;
  font-weight: 700;
  margin-bottom: 3px;
}
.season-id p,
.season-club p,
.season-slot p {
  font-size: 11px;
  color: #b7bbba;
}
.season-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.season-badge {
  font-size: 10.5px;
  padding: 5px 11px;
  border: 1px solid rgba(32, 30, 27, 0.15);
  color: #5c5a56;
}
.season-badge.is-paid {
  background: #c41e1e;
  color: #fff;
  border-color: #c41e1e;
}
.season-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid rgba(32, 30, 27, 0.06);
  font-size: 12px;
}
.season-row span:first-child {
  color: #b7bbba;
}
.season-paid {
  margin-top: 12px;
}
.season-slot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(32, 30, 27, 0.06);
  color: #c41e1e;
}
.season-slot:last-child,
.season-rule:last-child {
  border-bottom: none;
}
.season-slot h4 {
  font-size: 12.5px;
  font-weight: 500;
  color: #201e1b;
}
.season-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.season-cal-nav b {
  font-size: 12.5px;
  font-weight: 700;
}
.season-cal-nav button {
  border: 0;
  background: transparent;
  color: #b7bbba;
  padding: 4px;
  cursor: pointer;
}
.season-cal-nav button:disabled {
  opacity: 0.35;
  cursor: default;
}
.season-cal-head,
.season-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.season-cal-head {
  text-align: center;
  font-size: 10px;
  color: #b7bbba;
  margin-bottom: 6px;
}
.season-cal-grid {
  gap: 3px;
}
.season-cal-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.season-cal-cell.is-empty {
  visibility: hidden;
}
.season-cal-cell.is-past {
  background: rgba(32, 30, 27, 0.05);
  color: #b7bbba;
}
.season-cal-cell.is-upcoming {
  background: #c41e1e;
  color: #fff;
  font-weight: 700;
}
.season-cal-cell.is-today {
  box-shadow: inset 0 0 0 1px #201e1b;
}
.season-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 10.5px;
  color: #5c5a56;
}
.season-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.season-legend i {
  width: 9px;
  height: 9px;
  display: inline-block;
}
.season-legend i.is-past {
  background: rgba(32, 30, 27, 0.1);
}
.season-legend i.is-upcoming {
  background: #c41e1e;
}
.season-legend i.is-today {
  box-shadow: inset 0 0 0 1px #201e1b;
}
.season-club {
  display: flex;
  gap: 12px;
}
.season-club img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  flex: none;
}
.season-club h4 {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}
.season-club p {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}
.season-amenities {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(32, 30, 27, 0.07);
}
.season-amenities span {
  font-size: 11px;
  color: #5c5a56;
}
.season-rule {
  display: flex;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid rgba(32, 30, 27, 0.06);
  font-size: 11.5px;
}
.season-rule :deep(.material-symbols-rounded) {
  color: #d9a91f;
  flex: none;
}
</style>
