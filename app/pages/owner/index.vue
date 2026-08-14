<script setup lang="ts">
/**
 * OTP/login may land on /owner (AuthFlowModal fallback + QA matrix).
 * Canonical desk is calendar — do not open «بیشتر» here (sheet is ?more=1 from subpages only).
 */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const localePath = useLocalePath()

await navigateTo(localePath('/owner/calendar'), { replace: true })
</script>

<template>
  <div />
</template>
