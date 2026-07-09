<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { t } = useI18n()
const { data } = await useAuthedFetch('/api/coach/profile')
const { data: clientsData } = await useAuthedFetch('/api/coach/clients')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.schedule') }}</h1>
    <div v-for="a in data?.availability" :key="a.id" class="ios-card p-3 text-sm">
      {{ t('coach.dayLabel', { day: a.dayOfWeek }) }}: {{ a.startTime }} – {{ a.endTime }}
    </div>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="session in clientsData?.sessions?.slice(0, 7) || []" :key="session.id" class="ios-card p-3 text-sm">
        <p class="font-bold">{{ session.athlete.name }}</p>
        <p>{{ session.date }} · {{ session.startTime }}</p>
      </div>
    </section>
  </div>
</template>
