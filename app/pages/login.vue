<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { openLogin, openRegister } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  const mode = route.query.mode
  const error = route.query.error
  const notice = error === 'session' ? t('auth.sessionExpired') : undefined

  if (mode === 'register') {
    openRegister({ returnTo: returnTo.value || undefined, notice })
  } else {
    openLogin({ returnTo: returnTo.value || undefined, notice })
  }
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
