<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { data, error } = await useAuthedFetch('/api/coach/today')
</script>

<template>
  <div class="space-y-4">
    <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ t('auth.dashboardLoadFailed') }}</p>
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-display text-xl font-black">{{ $t('coach.today') }}</h1>
      <NuxtLink :to="localePath('/coach/schedule')" class="text-sm font-bold text-brand-primary">{{ $t('coach.schedule') }}</NuxtLink>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-black text-brand-primary">{{ data?.sessions?.length || 0 }}</p>
        <p class="text-sm text-brand-gray-600">{{ $t('coach.today') }}</p>
      </div>
      <div class="ios-card p-4 text-center">
        <p class="text-2xl font-black text-brand-primary">{{ data?.upcomingSessions?.length || 0 }}</p>
        <p class="text-sm text-brand-gray-600">{{ $t('coach.upcoming') }}</p>
      </div>
    </div>

    <div v-for="s in data?.sessions" :key="s.id" class="ios-card p-3">
      <p class="font-bold">{{ s.athlete.name }}</p>
      <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi></p>
      <p class="text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ s.athlete.phone }}</bdi></p>
    </div>
    <p v-if="!data?.sessions?.length" class="rounded-xl border border-dashed border-black/10 bg-brand-cream/40 p-4 text-sm text-brand-gray-600">{{ $t('coach.noSessionsToday') }}</p>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="s in data?.upcomingSessions" :key="`upcoming-${s.id}`" class="ios-card p-3">
        <p class="font-bold">{{ s.athlete.name }}</p>
        <p class="text-sm" dir="auto">{{ formatIsoDate(s.date) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi></p>
      </div>
      <p v-if="!data?.upcomingSessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noUpcomingSessions') }}</p>
    </section>
  </div>
</template>
