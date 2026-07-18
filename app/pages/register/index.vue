<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { startGoogleSignIn, googleAuthEnabled } = useGoogleAuth()
const { openRegister, openLogin, openGate } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const { pilotNoCoach } = usePilotFlags()

onMounted(() => {
  const role = route.query.role
  if (role === 'owner') openRegister({ returnTo: returnTo.value, role: 'CLUB_ADMIN' })
  else if (role === 'coach' && !pilotNoCoach.value) openRegister({ returnTo: returnTo.value, role: 'COACH' })
  else if (role === 'athlete') openRegister({ returnTo: returnTo.value, role: 'ATHLETE' })
  else openRegister({ returnTo: returnTo.value })
})
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8 text-center">
    <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
    <h1 class="font-display text-xl font-bold">{{ t('auth.register') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('auth.roleSubtitle') }}</p>
    <button type="button" class="btn-primary w-full py-3" @click="openRegister({ returnTo })">
      {{ t('auth.registerWithPhone') }}
    </button>
    <button type="button" class="btn-canva-login w-full py-3" @click="openLogin({ returnTo })">
      {{ t('auth.loginWithPhone') }}
    </button>
    <AppGoogleSignInButton v-if="googleAuthEnabled" @click="startGoogleSignIn(returnTo)" />
    <button type="button" class="btn-ghost w-full" @click="openGate({ returnTo })">
      {{ t('auth.gateTitle') }}
    </button>
    <NuxtLink :to="localePath('/')" class="block text-sm font-bold text-brand-navy underline">
      {{ t('common.back') }}
    </NuxtLink>
  </div>
</template>
