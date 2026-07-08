<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })
</script>

<template>
  <div class="max-w-md rounded-xl border bg-white p-6">
    <h1 class="font-display text-xl font-black">{{ $t('owner.settings') }}</h1>
    <p class="mt-2 text-sm text-brand-gray-600">{{ $t('owner.settingsPlaceholder') }}</p>
  </div>
</template>
