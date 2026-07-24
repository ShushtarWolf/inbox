<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const localePath = useLocalePath()
const { openRegister } = useAuthFlow()
const { pilotNoCoach } = usePilotFlags()

onMounted(async () => {
  if (pilotNoCoach.value) {
    openRegister({ role: 'ATHLETE' })
  } else {
    openRegister({ role: 'COACH' })
  }
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
