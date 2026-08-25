<script setup lang="ts">
import ExtCalSourcesGrid from '../../components/ExtCalSourcesGrid.vue'
import type { CalendarSourcesPayload } from '../../components/ExtCalSourcesGrid.vue'

definePageMeta({
  layout: 'dashboard-owner',
  middleware: ['auth', 'role'],
  role: 'CLUB_ADMIN',
  ssr: false,
})

const localePath = useLocalePath()
const { today } = useLocalDate()
const { t } = useI18n()

const date = ref(today())
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

const { data, pending, error, refresh } = await useAuthedFetch<CalendarSourcesPayload>(
  '/api/owner/calendar-sources',
  { query: computed(() => ({ date: date.value })) },
)

useOwnerClubRefresh(refresh)

watch(date, () => refresh())

function restartPolling() {
  if (pollTimer.value) clearInterval(pollTimer.value)
  const interval = data.value?.pollIntervalMs || 25_000
  pollTimer.value = setInterval(() => refresh(), interval)
}

watch(() => data.value?.pollIntervalMs, () => restartPolling(), { immediate: true })

onBeforeUnmount(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})
</script>

<template>
  <div class="space-y-4 pb-24">
    <CanvaSubpageHeader to="/owner/calendar" title="منابع تقویم" />
    <ExtCalSourcesGrid
      :data="data"
      :pending="pending"
      :error="error"
      :date="date"
      @update:date="date = $event"
      @refresh="refresh()"
    />
    <div class="px-4">
      <NuxtLink :to="localePath('/owner/calendar')" class="canva-gate-btn-secondary inline-flex">
        {{ t('owner.calendarShort') }}
      </NuxtLink>
    </div>
  </div>
</template>
