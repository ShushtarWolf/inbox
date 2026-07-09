<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { data } = await useAuthedFetch('/api/coach/today')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.today') }}</h1>
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
      <p class="text-sm">{{ s.startTime }} – {{ s.endTime }}</p>
      <p class="text-xs text-brand-gray-600">{{ s.athlete.phone }}</p>
    </div>
    <p v-if="!data?.sessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noSessionsToday') }}</p>

    <section class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.upcomingSessions') }}</h2>
      <div v-for="s in data?.upcomingSessions" :key="`upcoming-${s.id}`" class="ios-card p-3">
        <p class="font-bold">{{ s.athlete.name }}</p>
        <p class="text-sm">{{ s.date }} · {{ s.startTime }} – {{ s.endTime }}</p>
      </div>
    </section>
  </div>
</template>
