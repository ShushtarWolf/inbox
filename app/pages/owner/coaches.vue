<script setup lang="ts">
/** Coaches are independent — no owner staff/affiliation surface. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })
await navigateTo('/owner/settings', { replace: true })
</script>

<template>
  <div />
</template>
