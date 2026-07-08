<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { t } = useI18n()
const { data } = await useAuthedFetch('/api/coach/profile')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.schedule') }}</h1>
    <div v-for="a in data?.availability" :key="a.id" class="ios-card p-3 text-sm">
      {{ t('coach.dayLabel', { day: a.dayOfWeek }) }}: {{ a.startTime }} – {{ a.endTime }}
    </div>
  </div>
</template>
