<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { data } = await useAuthedFetch('/api/coach/clients')
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('coach.clients') }}</h1>
    <div v-for="c in data?.clients" :key="c.id" class="ios-card p-3">
      <p class="font-bold">{{ c.name }}</p>
      <p class="text-sm text-brand-gray-600">{{ c.phone }}</p>
      <p class="text-xs text-brand-gray-600">{{ $t('coach.nextSession') }}: {{ c.nextSessionDate }} · {{ c.nextSessionTime }}</p>
    </div>
    <p v-if="!data?.clients?.length" class="rounded-xl border border-dashed border-black/10 bg-brand-cream/40 p-4 text-sm text-brand-gray-600">{{ $t('coach.noClients') }}</p>
  </div>
</template>
