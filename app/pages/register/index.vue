<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const localePath = useLocalePath()
const route = useRoute()
const { openRegister } = useAuthFlow()
const { pilotNoCoach } = usePilotFlags()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  const role = route.query.role
  if (role === 'owner') {
    openRegister({ returnTo: returnTo.value || undefined, role: 'CLUB_ADMIN' })
  } else if (role === 'coach' && !pilotNoCoach.value) {
    openRegister({ returnTo: returnTo.value || undefined, role: 'COACH' })
  } else {
    openRegister({ returnTo: returnTo.value || undefined, role: 'ATHLETE' })
  }
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
