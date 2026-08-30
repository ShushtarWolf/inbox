<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
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
</script>

<template>
  <div class="tail-page-stack">
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
    <div
      v-if="approvalStatus !== 'APPROVED'"
      class="ios-card p-4 text-sm"
      :class="approvalStatus === 'REJECTED' ? 'venus-alert-error' : 'bg-amber-50 text-amber-900'"
    >
      <p class="font-bold">
        {{ approvalStatus === 'REJECTED' ? $t('coach.approvalRejected') : $t('coach.approvalPending') }}
      </p>
      <p v-if="data?.coach?.approvalNote" class="mt-1 text-xs">{{ data.coach.approvalNote }}</p>
    </div>
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-display text-xl font-bold">{{ $t('coach.today') }}</h1>
      <NuxtLink :to="localePath('/coach/schedule')" class="text-sm font-bold text-brand-primary">{{ $t('coach.schedule') }}</NuxtLink>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-bold text-brand-primary">{{ data?.sessions?.length || 0 }}</p>
        <p class="text-sm text-brand-gray-600">{{ $t('coach.today') }}</p>
      </div>
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-bold text-brand-primary">{{ data?.upcomingSessions?.length || 0 }}</p>
        <p class="text-sm text-brand-gray-600">{{ $t('coach.upcoming') }}</p>
      </div>
    </div>

    <div v-for="s in data?.sessions" :key="s.id" class="ios-card p-3">
      <p class="font-bold">{{ s.athlete.name }}</p>
      <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi></p>
      <p class="text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ formatPhone(s.athlete.phone) }}</bdi></p>
    </div>
    <p v-if="!data?.sessions?.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">{{ $t('coach.noSessionsToday') }}</p>

    <div class="mt-2">
      <RoleDashboardSwitcher current="COACH" />
    </div>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="s in data?.upcomingSessions" :key="`upcoming-${s.id}`" class="ios-card p-3">
        <p class="font-bold">{{ s.athlete.name }}</p>
        <p class="text-sm" dir="auto">{{ formatIsoDate(s.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi></p>
      </div>
      <p v-if="!data?.upcomingSessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noUpcomingSessions') }}</p>
    </section>
    </AppAsyncState>
  </div>
</template>
