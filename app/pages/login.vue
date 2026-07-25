<script setup lang="ts">
import { isAuthProtectedPath, sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { openLogin, openRegister, close, notice: flowNotice } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(async () => {
  const mode = route.query.mode
  const error = route.query.error
  const safeReturn = sanitizeReturnTo(returnTo.value) || localePath('/')

  // Stale session while browsing public pages: clear already done — don't block with modal
  if (error === 'session' && !isAuthProtectedPath(safeReturn)) {
    close()
    await navigateTo(safeReturn)
    return
  }

  // Preserve notice set by callers (e.g. reset-password success → /login)
  const notice = error === 'session' ? t('auth.sessionExpired') : (flowNotice.value || undefined)

  if (mode === 'register') {
    openRegister({ returnTo: returnTo.value || undefined, notice })
  } else {
    openLogin({ returnTo: returnTo.value || undefined, notice })
  }

  // Protected returnTo keeps modal on home; public returnTo opens under that page
  await navigateTo(
    error === 'session' && isAuthProtectedPath(safeReturn) ? localePath('/') : safeReturn,
  )
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
