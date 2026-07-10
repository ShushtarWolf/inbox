<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { data, pending, error } = await useAuthedFetch('/api/coach/clients')
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('coach.clients') }}</h1>
    <AppAsyncState :pending="pending" :error="error" :empty="!data?.clients?.length" skeleton-variant="table">
    <div v-for="c in data?.clients" :key="c.id" class="ios-card p-3">
      <p class="font-bold">{{ c.name }}</p>
      <p class="text-sm text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ c.phone }}</bdi></p>
      <p class="text-xs text-brand-gray-600">{{ $t('coach.nextSession') }}: <bdi dir="ltr" class="tabular-nums">{{ c.nextSessionDate }} · {{ c.nextSessionTime }}</bdi></p>
    </div>
    </AppAsyncState>
  </div>
</template>
