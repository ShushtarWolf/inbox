<script setup lang="ts">
/** Canva: «بیشتر» is a sheet over calendar, not a hub page. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const localePath = useLocalePath()

await navigateTo({ path: localePath('/owner/calendar'), query: { more: '1' } }, { replace: true })
</script>

<template>
  <div />
</template>
