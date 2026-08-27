<script setup lang="ts">
import { weekdayKeyFromDayOfWeek } from '#shared/recurringSessions.ts'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { data, pending: profilePending, error: profileError } = await useAuthedFetch<{
  availability?: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>
}>('/api/coach/profile')
const { data: clientsData, pending: clientsPending, error: clientsError } = await useAuthedFetch<{
  sessions?: Array<{
    id: string
    date: string
    startTime: string
    endTime: string
    athlete: { name: string }
  }>
}>('/api/coach/clients')
const pending = computed(() => profilePending.value || clientsPending.value)
const error = computed(() => profileError.value || clientsError.value)

function weekdayLabel(dayOfWeek: number) {
  return t(`owner.weekdays.${weekdayKeyFromDayOfWeek(dayOfWeek)}`)
}
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('coach.schedule') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">

    <div v-if="data?.availability?.length" class="overflow-hidden border border-brand-gray-100 ios-card p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-brand-gray-100 bg-brand-gray-50 text-xs text-brand-gray-600">
            <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityDay') }}</th>
            <th class="px-3 py-2 text-start font-bold">{{ $t('coach.availabilityHours') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in data.availability"
            :key="a.id"
            class="border-b border-brand-gray-100 last:border-b-0"
          >
            <td class="px-3 py-2 font-medium text-brand-navy">{{ weekdayLabel(a.dayOfWeek) }}</td>
            <td class="px-3 py-2 tabular-nums">
              <bdi dir="ltr">{{ formatTimeRange(a.startTime, a.endTime) }}</bdi>
            </td>
          </tr>
        </tbody>
      </table>
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
