<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { data } = await useAuthedFetch('/api/coach/profile')
const { data: clientsData } = await useAuthedFetch('/api/coach/clients')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.schedule') }}</h1>

    <div v-if="data?.availability?.length" class="space-y-2">
      <div v-for="a in data.availability" :key="a.id" class="ios-card p-3 text-sm">
        {{ t('coach.dayLabel', { day: a.dayOfWeek }) }}:
        <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(a.startTime, a.endTime) }}</bdi>
      </div>
    </div>
    <p v-else class="rounded-xl border border-dashed border-black/10 bg-brand-cream/40 p-4 text-sm text-brand-gray-600">{{ $t('coach.noAvailability') }}</p>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="session in clientsData?.sessions?.slice(0, 7) || []" :key="session.id" class="ios-card p-3 text-sm">
        <p class="font-bold">{{ session.athlete.name }}</p>
        <p dir="auto">{{ formatIsoDate(session.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(session.startTime, session.endTime) }}</bdi></p>
      </div>
      <p v-if="!clientsData?.sessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noUpcomingSessions') }}</p>
    </section>
  </div>
</template>
