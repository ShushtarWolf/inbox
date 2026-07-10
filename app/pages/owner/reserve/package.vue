<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const localePath = useLocalePath()
await navigateTo(localePath('/owner'), { replace: true })
</script>

<template>
  <div />
</template>
