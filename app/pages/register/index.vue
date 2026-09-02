<script setup lang="ts">
/**
 * Deep-link into signup. No guest middleware — logged-in users adding another
 * role (e.g. ?role=owner) must reach openRegister without being bounced.
 */
const localePath = useLocalePath()
const route = useRoute()
const { openRegister } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  const role = route.query.role
  if (role === 'owner') {
    openRegister({ returnTo: returnTo.value || localePath('/owner'), role: 'CLUB_ADMIN' })
  } else if (role === 'athlete') {
    openRegister({ returnTo: returnTo.value || undefined, role: 'ATHLETE' })
  } else {
    // Bare /register (and legacy ?role=coach) → athlete/owner picker only.
    openRegister({ returnTo: returnTo.value || undefined })
  }
  await navigateTo(localePath('/'), { replace: true })
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
