<script setup lang="ts">
/**
 * Deep-link only — primary UX is the history list + inline actions on `/athlete/bookings`.
 * Redirect preserves booking id as query for highlight/scroll.
 */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const id = String(route.params.id || '')

await navigateTo(
  localePath({
    path: '/athlete/bookings',
    query: id ? { booking: id } : {},
  }),
  { replace: true },
)
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
