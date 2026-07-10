<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { data, pending: profilePending, error: profileError } = await useAuthedFetch('/api/coach/profile')
const { data: clientsData, pending: clientsPending, error: clientsError } = await useAuthedFetch('/api/coach/clients')
const pending = computed(() => profilePending.value || clientsPending.value)
const error = computed(() => profileError.value || clientsError.value)
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('coach.schedule') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">

    <div v-if="data?.availability?.length" class="space-y-2">
      <div v-for="a in data.availability" :key="a.id" class="ios-card p-3 text-sm">
        {{ t('coach.dayLabel', { day: a.dayOfWeek }) }}:
        <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(a.startTime, a.endTime) }}</bdi>
      </div>
    </div>
    <p v-else class="ios-card border-dashed p-4 text-sm text-brand-gray-600">{{ $t('coach.noAvailability') }}</p>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="session in clientsData?.sessions?.slice(0, 7) || []" :key="session.id" class="ios-card p-3 text-sm">
        <p class="font-bold">{{ session.athlete.name }}</p>
        <p dir="auto">{{ formatIsoDate(session.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(session.startTime, session.endTime) }}</bdi></p>
      </div>
      <p v-if="!clientsData?.sessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noUpcomingSessions') }}</p>
    </section>
    </AppAsyncState>
  </div>
</template>
