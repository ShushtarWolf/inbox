<script setup lang="ts">
/**
 * Deep-link into coach signup. No guest middleware — logged-in users adding
 * COACH as another role must reach openRegister (guest MW used to bounce them).
 */
const localePath = useLocalePath()
const { openRegister } = useAuthFlow()

onMounted(async () => {
  openRegister({ role: 'COACH', returnTo: localePath('/coach') })
  await navigateTo(localePath('/'), { replace: true })
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
