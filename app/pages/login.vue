<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const localePath = useLocalePath()
const route = useRoute()
const { openLogin, openRegister } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  const mode = route.query.mode
  if (mode === 'register') {
    openRegister({ returnTo: returnTo.value || undefined })
  } else {
    openLogin({ returnTo: returnTo.value || undefined })
  }
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
