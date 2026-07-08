<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { data } = await useAuthedFetch('/api/coach/today')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.today') }}</h1>
    <div v-for="s in data?.sessions" :key="s.id" class="ios-card p-3">
      <p class="font-bold">{{ s.athlete.name }}</p>
      <p class="text-sm">{{ s.startTime }} – {{ s.endTime }}</p>
    </div>
    <p v-if="!data?.sessions?.length" class="text-sm text-brand-gray-600">{{ $t('coach.noSessionsToday') }}</p>
  </div>
</template>
