<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { data } = await useAuthedFetch('/api/coach/clients')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.clients') }}</h1>
    <div v-for="c in data?.clients" :key="c.id" class="ios-card p-3">
      <p class="font-bold">{{ c.name }}</p>
      <p class="text-sm text-brand-gray-600">{{ c.phone }}</p>
    </div>
  </div>
</template>
