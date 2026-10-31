<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const {
  formatIsoDate,
  formatTimeRange,
  formatPhone,
  formatCurrency,
  formatNumber,
} = useFormatters()
const { today } = useLocalDate()
const calendarAnchor = ref(today())
const { localizedField } = useLocalizedField()

type DashboardSession = {
  id: string
  startTime: string
  endTime: string
  status: string
  athlete: { name: string; phone: string; avatarUrl?: string | null }
  courtBooking?: {
    slot?: {
      court?: {
        nameFa?: string
        nameEn?: string
        club?: { nameFa: string; nameEn: string }
      }
    }
  } | null
}

const { data, pending, error, refresh } = await useAuthedFetch<{
  coach?: { isBookable?: boolean; approvalStatus?: string; approvalNote?: string | null }
  sessions?: DashboardSession[]
  upcomingSessions?: Array<{
    id: string
    date: string
    startTime: string
    endTime: string
    athlete: { name: string; phone: string; avatarUrl?: string | null }
  }>
  stats?: {
    todayCount: number
    upcomingCount: number
    activeStudents: number
    monthlyRevenue: number
    monthlyRevenueCash?: number
    monthlyRevenueOnline?: number
    monthlyRevenueDeltaPct: number | null
    pendingSettlement: number
  }
  revenueMonths?: Array<{ key: string; amount: number }>
  sessionDatesThisMonth?: string[]
  recentWithdraws?: Array<{ amount: number; createdAt: string; status: string }>
}>('/api/coach/dashboard')

const approvalStatus = computed(() => data.value?.coach?.approvalStatus || 'APPROVED')
const acceptNewStudents = ref(true)
const togglingBookable = ref(false)

watch(
  () => data.value?.coach?.isBookable,
  (v) => {
    if (v !== undefined) acceptNewStudents.value = v
  },
  { immediate: true },
)

async function toggleAcceptStudents() {
  if (togglingBookable.value) return
  const next = !acceptNewStudents.value
  togglingBookable.value = true
  try {
    await $fetch('/api/coach/profile', { method: 'PATCH', body: { isBookable: next } })
    acceptNewStudents.value = next
    await refresh()
  } catch (err: unknown) {
    await refresh()
    throw err
  } finally {
    togglingBookable.value = false
  }
}

function sessionClubLine(s: DashboardSession) {
  const court = s.courtBooking?.slot?.court
  if (!court) return ''
  const club = court.club ? localizedField(court.club, 'nameFa', 'nameEn') : ''
  const courtName = localizedField(court, 'nameFa', 'nameEn')
  return club ? `${club} · ${courtName}` : courtName
}

const sessionDayMarks = computed(() => {
  const marks: Record<string, 'busy' | 'soft'> = {}
  for (const d of data.value?.sessionDatesThisMonth || []) marks[d] = 'busy'
  return marks
})

function statusTagClass(status: string) {
  if (status === 'CONFIRMED') return 'coach-sess-status coach-sess-status-ok'
  if (status === 'PENDING') return 'coach-sess-status coach-sess-status-wait'
  return 'coach-sess-status'
}

function statusLabel(status: string) {
  if (status === 'CONFIRMED') return t('coach.dashboardStatusConfirmed')
  if (status === 'PENDING') return t('coach.dashboardStatusPending')
  if (status === 'CANCELLED') return t('coach.dashboardStatusCancelled')
  return status
}

function athleteInitial(name: string) {
  const trimmed = name.trim()
  return trimmed ? trimmed[0] : '؟'
}
</script>

<template>
  <div class="venus-page-stack">
    <!-- HTML m-coach mobShell: logo + bell + square navy avatar -->
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
        <div
          v-if="approvalStatus !== 'APPROVED'"
          class="canva-panel p-4 text-sm text-start"
          :class="approvalStatus === 'REJECTED' ? 'venus-alert-error' : 'bg-amber-50 text-amber-900'"
        >
          <p class="font-bold">
            {{ approvalStatus === 'REJECTED' ? $t('coach.approvalRejected') : $t('coach.approvalPending') }}
          </p>
          <p v-if="data?.coach?.approvalNote" class="mt-1 text-xs">{{ data.coach.approvalNote }}</p>
        </div>

        <!-- HTML .cxh -->
        <div class="coach-today-hd">
          <h1 class="coach-today-title">{{ t('coach.today') }}</h1>
          <NuxtLink :to="localePath('/coach/schedule')" class="coach-today-tiny">
            {{ t('coach.schedule') }}
          </NuxtLink>
        </div>

        <!-- HTML .cxstats — امروز / پیش رو -->
        <div class="coach-today-stats">
          <div class="coach-today-stat">
            <b class="tabular-nums">{{ formatNumber(data?.stats?.todayCount || 0) }}</b>
            <small>{{ t('coach.today') }}</small>
          </div>
          <div class="coach-today-stat">
            <b class="tabular-nums">{{ formatNumber(data?.stats?.upcomingCount || 0) }}</b>
            <small>{{ t('coach.upcoming') }}</small>
          </div>
        </div>

        <!-- HTML today session cards (.cxsess) -->
        <h2 class="coach-today-sub">{{ t('coach.today') }}</h2>
        <CanvaEmptyState
          v-if="!data?.sessions?.length"
          :title="$t('coach.noSessionsToday')"
          doodle="bench"
        />
        <div v-else class="space-y-2">
          <article
            v-for="s in data?.sessions"
            :key="s.id"
            class="coach-sess-card"
          >
            <span class="coach-sess-av" aria-hidden="true">
              <img v-if="s.athlete.avatarUrl" :src="s.athlete.avatarUrl" alt="" class="h-full w-full object-cover">
              <span v-else>{{ athleteInitial(s.athlete.name) }}</span>
            </span>
            <div class="min-w-0 flex-1 text-start">
              <b class="block text-[13px] font-bold text-brand-navy">{{ s.athlete.name }}</b>
              <small class="mt-0.5 block text-[11.5px] text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi>
                ·
                <bdi dir="ltr" class="tabular-nums">{{ formatPhone(s.athlete.phone) }}</bdi>
              </small>
              <small v-if="sessionClubLine(s)" class="mt-0.5 block text-[11.5px] text-brand-gray-600">
                {{ sessionClubLine(s) }}
              </small>
            </div>
            <span :class="statusTagClass(s.status)">{{ statusLabel(s.status) }}</span>
          </article>
        </div>

        <!-- HTML upcoming (.cxsub + .cxsess) -->
        <h2 class="coach-today-sub">{{ t('coach.upcomingSessions') }}</h2>
        <p v-if="!data?.upcomingSessions?.length" class="text-start text-sm text-brand-gray-600">
          {{ $t('coach.noUpcomingSessions') }}
        </p>
        <div v-else class="space-y-2">
          <article
            v-for="s in data?.upcomingSessions"
            :key="`upcoming-${s.id}`"
            class="coach-sess-card"
          >
            <span class="coach-sess-av" aria-hidden="true">
              <img v-if="s.athlete.avatarUrl" :src="s.athlete.avatarUrl" alt="" class="h-full w-full object-cover">
              <span v-else>{{ athleteInitial(s.athlete.name) }}</span>
            </span>
            <div class="min-w-0 flex-1 text-start">
              <b class="block text-[13px] font-bold text-brand-navy">{{ s.athlete.name }}</b>
              <small class="mt-0.5 block text-[11.5px] text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi>
                ·
                <bdi dir="ltr" class="tabular-nums">{{ formatPhone(s.athlete.phone) }}</bdi>
              </small>
              <small class="mt-0.5 block text-[11.5px] text-brand-gray-600">
                {{ formatIsoDate(s.date) }}
              </small>
            </div>
            <span class="coach-sess-status coach-sess-status-ok">{{ t('coach.dashboardStatusConfirmed') }}</span>
          </article>
        </div>

        <RoleDashboardSwitcher current="COACH" />

        <!-- kept-product: accept toggle + revenue / calendar / settlements -->
        <div class="coach-dash-welcome mt-4">
          <div class="canva-auth-welcome-hand !mx-0 shrink-0" aria-hidden="true">
            <AuthHandStopIcon :size="20" />
          </div>
          <div class="min-w-0 flex-1 text-start">
            <b class="block text-sm font-bold text-brand-navy">{{ t('coach.dashboardWelcomeTitle') }}</b>
            <small class="mt-0.5 block text-xs text-brand-gray-600">
              {{ t('coach.dashboardWelcomeSessions', { count: formatNumber(data?.stats?.todayCount || 0) }) }}
            </small>
          </div>
          <div class="coach-dash-switch-wrap text-start">
            <span class="coach-dash-switch-label">{{ t('coach.acceptNewStudents') }}</span>
            <button
              type="button"
              class="coach-dash-switch"
              :class="{ 'coach-dash-switch-off': !acceptNewStudents }"
              :aria-pressed="acceptNewStudents"
              :disabled="togglingBookable"
              @click="toggleAcceptStudents"
            />
          </div>
        </div>

        <div class="coach-dash-stats mt-3">
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatActiveStudents') }}</span>
            <b class="tabular-nums">{{ formatNumber(data?.stats?.activeStudents || 0) }}</b>
          </div>
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatMonthlyRevenue') }}</span>
            <b class="tabular-nums" dir="ltr">{{ formatCurrency(data?.stats?.monthlyRevenue || 0) }}</b>
            <small class="tabular-nums text-brand-gray-600">
              {{ t('coach.dashboardRevenueSplit', {
                cash: formatCurrency(data?.stats?.monthlyRevenueCash || 0),
                online: formatCurrency(data?.stats?.monthlyRevenueOnline || 0),
              }) }}
            </small>
            <small
              v-if="data?.stats?.monthlyRevenueDeltaPct != null"
              class="text-emerald-700"
            >
              {{ t('coach.dashboardRevenueDelta', { pct: formatNumber(Math.abs(data.stats.monthlyRevenueDeltaPct)) }) }}
            </small>
          </div>
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatPendingSettlement') }}</span>
            <b class="tabular-nums" dir="ltr">{{ formatCurrency(data?.stats?.pendingSettlement || 0) }}</b>
          </div>
        </div>

        <div class="coach-dash-two-col mt-3">
          <section class="coach-dash-card">
            <h2 class="coach-dash-card-title">{{ t('coach.dashboardMonthCalendar') }}</h2>
            <AppJalaliCalendar
              v-model="calendarAnchor"
              variant="owner"
              :day-marks="sessionDayMarks"
            />
          </section>
          <section class="coach-dash-card">
            <h2 class="coach-dash-card-title">{{ t('coach.dashboardRevenueChart') }}</h2>
            <CoachDashboardBarChart v-if="data?.revenueMonths?.length" :months="data.revenueMonths" />
            <p v-else class="text-sm text-brand-gray-600">{{ t('coach.dashboardNoSettlements') }}</p>
          </section>
        </div>

        <section class="coach-dash-card mt-3">
          <h2 class="coach-dash-card-title">{{ t('coach.dashboardRecentSettlements') }}</h2>
          <p v-if="!data?.recentWithdraws?.length" class="text-sm text-brand-gray-600">
            {{ t('coach.dashboardNoSettlements') }}
          </p>
          <table v-else class="coach-dash-table">
            <thead>
              <tr>
                <th>{{ t('coach.dashboardColDate') }}</th>
                <th>{{ t('coach.dashboardColAmount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in data.recentWithdraws" :key="idx">
                <td>{{ formatIsoDate(row.createdAt.slice(0, 10)) }}</td>
                <td dir="ltr" class="tabular-nums">{{ formatCurrency(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </AppAsyncState>
    </div>
  </div>
</template>
