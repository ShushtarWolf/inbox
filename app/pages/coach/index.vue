<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const localePath = useLocalePath()
const { formatIsoDate, formatTimeRange, formatPhone } = useFormatters()
const { data, pending, error } = await useAuthedFetch<{
  coach?: { approvalStatus?: string; approvalNote?: string | null }
  sessions?: Array<{
    id: string
    startTime: string
    endTime: string
    athlete: { name: string; phone: string }
  }>
  upcomingSessions?: Array<{
    id: string
    date: string
    startTime: string
    endTime: string
    athlete: { name: string; phone: string }
  }>
}>('/api/coach/today')

const approvalStatus = computed(() => data.value?.coach?.approvalStatus || 'APPROVED')
const todayCount = computed(() => data.value?.sessions?.length || 0)
const upcomingCount = computed(() => data.value?.upcomingSessions?.length || 0)
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

        <div class="flex items-center justify-between gap-3">
          <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
            {{ $t('coach.today') }}
          </h1>
          <NuxtLink
            :to="localePath('/coach/schedule')"
            class="canva-cal-date-select shrink-0 no-underline"
          >
            {{ $t('coach.schedule') }}
          </NuxtLink>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="canva-crm-stat">
            <p class="canva-crm-stat-value">{{ todayCount }}</p>
            <p class="canva-crm-stat-label">{{ $t('coach.today') }}</p>
          </div>
          <div class="canva-crm-stat">
            <p class="canva-crm-stat-value">{{ upcomingCount }}</p>
            <p class="canva-crm-stat-label">{{ $t('coach.upcoming') }}</p>
          </div>
        </div>

        <section class="space-y-2">
          <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coach.today') }}</h2>
          <CanvaEmptyState
            v-if="!data?.sessions?.length"
            :title="$t('coach.noSessionsToday')"
            doodle="bench"
          />
          <div v-else class="canva-finance-tx-grid">
            <article
              v-for="s in data?.sessions"
              :key="s.id"
              class="canva-finance-tx-card"
            >
              <div class="min-w-0 flex-1 text-start">
                <p class="text-sm font-bold text-brand-navy">{{ s.athlete.name }}</p>
                <p class="mt-0.5 text-xs font-medium text-brand-gray-600">
                  <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi>
                </p>
                <p class="mt-0.5 text-[11px] text-brand-gray-500">
                  <bdi dir="ltr" class="tabular-nums">{{ formatPhone(s.athlete.phone) }}</bdi>
                </p>
              </div>
            </article>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coach.upcomingSessions') }}</h2>
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
              </div>
            </article>
          </div>
        </section>

        <RoleDashboardSwitcher current="COACH" />
      </AppAsyncState>
    </div>
  </div>
</template>
