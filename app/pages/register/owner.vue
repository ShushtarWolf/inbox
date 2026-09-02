<script setup lang="ts">
/**
 * Deep-link into owner signup. No guest middleware — logged-in users adding
 * CLUB_ADMIN as a second role must reach openRegister (guest MW used to bounce them).
 */
const localePath = useLocalePath()
const route = useRoute()
const { openRegister } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  openRegister({ returnTo: returnTo.value || localePath('/owner'), role: 'CLUB_ADMIN' })
  await navigateTo(localePath('/'), { replace: true })
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
