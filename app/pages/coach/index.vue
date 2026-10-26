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
  athlete: { name: string; phone: string }
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
    athlete: { name: string; phone: string }
  }>
  stats?: {
    todayCount: number
    upcomingCount: number
    activeStudents: number
    monthlyRevenue: number
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
  if (!court) return '—'
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
  if (status === 'CONFIRMED') return 'coach-dash-tag coach-dash-tag-green'
  if (status === 'PENDING') return 'coach-dash-tag coach-dash-tag-mustard'
  return 'coach-dash-tag'
}

function statusLabel(status: string) {
  if (status === 'CONFIRMED') return t('coach.dashboardStatusConfirmed')
  if (status === 'PENDING') return t('coach.dashboardStatusPending')
  if (status === 'CANCELLED') return t('coach.dashboardStatusCancelled')
  return status
}

const welcomeSessionsLine = computed(() =>
  t('coach.dashboardWelcomeSessions', { count: formatNumber(data.value?.stats?.todayCount || 0) }),
)
</script>

<template>
  <div class="venus-page-stack">
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

        <div class="coach-dash-welcome">
          <div class="canva-auth-welcome-hand !mx-0 shrink-0" aria-hidden="true">
            <AuthHandStopIcon :size="20" />
          </div>
          <div class="min-w-0 flex-1 text-start">
            <b class="block text-sm font-bold text-brand-navy">{{ t('coach.dashboardWelcomeTitle') }}</b>
            <small class="mt-0.5 block text-xs text-brand-gray-600">{{ welcomeSessionsLine }}</small>
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

        <div class="coach-dash-stats">
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatToday') }}</span>
            <b class="tabular-nums">{{ formatNumber(data?.stats?.todayCount || 0) }}</b>
          </div>
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatActiveStudents') }}</span>
            <b class="tabular-nums">{{ formatNumber(data?.stats?.activeStudents || 0) }}</b>
          </div>
          <div class="coach-dash-stat">
            <span>{{ t('coach.dashboardStatMonthlyRevenue') }}</span>
            <b class="tabular-nums" dir="ltr">{{ formatCurrency(data?.stats?.monthlyRevenue || 0) }}</b>
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

        <div class="coach-dash-two-col">
          <section class="coach-dash-card">
            <h2 class="coach-dash-card-title">{{ t('coach.dashboardTodayTable') }}</h2>
            <CanvaEmptyState
              v-if="!data?.sessions?.length"
              :title="$t('coach.noSessionsToday')"
              doodle="bench"
            />
            <div v-else class="overflow-x-auto">
              <table class="coach-dash-table">
                <thead>
                  <tr>
                    <th>{{ t('coach.dashboardColTime') }}</th>
                    <th>{{ t('coach.dashboardColStudent') }}</th>
                    <th>{{ t('coach.dashboardColVenue') }}</th>
                    <th>{{ t('coach.dashboardColStatus') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in data?.sessions" :key="s.id">
                    <td><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi></td>
                    <td>{{ s.athlete.name }}</td>
                    <td>{{ sessionClubLine(s) }}</td>
                    <td><span :class="statusTagClass(s.status)">{{ statusLabel(s.status) }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="coach-dash-card">
            <h2 class="coach-dash-card-title">{{ t('coach.dashboardMonthCalendar') }}</h2>
            <AppJalaliCalendar
              v-model="calendarAnchor"
              variant="owner"
              :day-marks="sessionDayMarks"
            />
          </section>
        </div>

        <div class="coach-dash-two-col coach-dash-two-col-spaced">
          <section class="coach-dash-card">
            <h2 class="coach-dash-card-title">{{ t('coach.dashboardRevenueChart') }}</h2>
            <CoachDashboardBarChart v-if="data?.revenueMonths?.length" :months="data.revenueMonths" />
          </section>
          <section class="coach-dash-card">
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
        </div>

        <section class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coach.upcomingSessions') }}</h2>
            <NuxtLink :to="localePath('/coach/schedule')" class="text-xs font-bold text-brand-primary">
              {{ $t('coach.schedule') }}
            </NuxtLink>
          </div>
          <p v-if="!data?.upcomingSessions?.length" class="text-start text-sm text-brand-gray-600">
            {{ $t('coach.noUpcomingSessions') }}
          </p>
          <div v-else class="canva-finance-tx-grid">
            <article
              v-for="s in data?.upcomingSessions"
              :key="`upcoming-${s.id}`"
              class="canva-finance-tx-card"
            >
              <div class="min-w-0 flex-1 text-start">
                <p class="text-sm font-bold text-brand-navy">{{ s.athlete.name }}</p>
                <p class="mt-0.5 text-xs font-medium text-brand-gray-600" dir="auto">
                  {{ formatIsoDate(s.date) }}
                  ·
                  <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi>
                </p>
                <p class="mt-0.5 text-[11px] text-brand-gray-500">
                  <bdi dir="ltr" class="tabular-nums">{{ formatPhone(s.athlete.phone) }}</bdi>
                </p>
              </div>
            </article>
          </div>
        </section>

        <RoleDashboardSwitcher current="COACH" />
      </AppAsyncState>
    </div>
  </div>
</template>
