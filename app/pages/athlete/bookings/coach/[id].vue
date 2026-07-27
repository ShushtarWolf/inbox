<script setup lang="ts">
/**
 * Deep-link only — coach session detail folds into `/athlete/bookings` list.
 * Coach product remains gated by pilot middleware on `/book/coach` etc.
 */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const id = String(route.params.id || '')

await navigateTo(
  localePath({
    path: '/athlete/bookings',
    query: id ? { coachSession: id } : {},
  }),
  { replace: true },
)
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
