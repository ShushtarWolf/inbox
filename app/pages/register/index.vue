<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: refreshAuth } = useAuth()
const { startGoogleSignIn, googleAuthEnabled } = useGoogleAuth()
const { openRegister, openLogin } = useAuthFlow()
const { pilotNoCoach } = usePilotFlags()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(() => {
  const role = route.query.role
  if (role === 'owner') {
    navigateTo(localePath({ path: '/register/owner', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
    return
  }
  if (role === 'coach' && !pilotNoCoach.value) {
    navigateTo(localePath({ path: '/register/coach', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
  }
})

async function submit() {
  error.value = ''
  if (!name.value.trim() || !email.value.trim()) {
    error.value = t('auth.registerFailed')
    return
  }
  if (password.value.length < 6) {
    error.value = t('auth.passwordTooShort')
    return
  }
  submitting.value = true
  try {
    const result = await $fetch<{ redirectTo?: string }>('/api/auth/register', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        locale: locale.value,
      },
    })
    await refreshAuth()
    const safeReturnTo = sanitizeReturnTo(returnTo.value, locale.value === 'en' ? 'en' : 'fa')
    await navigateTo(safeReturnTo || result.redirectTo || localePath('/athlete'))
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    if (status === 409) error.value = t('auth.emailTaken')
    else if (status === 429) error.value = t('errors.rateLimited')
    else if (status === 403) error.value = t('auth.demoUnavailable')
    else error.value = t('auth.registerFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <div class="text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
      <h1 class="mt-3 font-display text-xl font-bold">{{ t('auth.registerAthleteTitle') }}</h1>
      <p class="mt-1 text-sm text-brand-gray-600">{{ t('register.athleteSubtitle') }}</p>
    </div>

    <RegisterRolePicker active="athlete" />

    <p v-if="error" class="venus-alert-error">{{ error }}</p>

    <form class="venus-form-stack" @submit.prevent="submit">
      <AppFormField field-id="register-name" :label="t('auth.name')" required>
        <input id="register-name" v-model="name" class="neo-input" autocomplete="name" required />
      </AppFormField>
      <AppFormField field-id="register-email" :label="t('auth.email')" required>
        <input
          id="register-email"
          v-model="email"
          type="email"
          dir="ltr"
          class="neo-input"
          autocomplete="email"
          required
        />
      </AppFormField>
      <AppFormField field-id="register-password" :label="t('auth.password')" required>
        <input
          id="register-password"
          v-model="password"
          type="password"
          class="neo-input"
          autocomplete="new-password"
          minlength="6"
          required
        />
      </AppFormField>
      <button type="submit" class="btn-primary w-full py-3" :disabled="submitting">
        {{ submitting ? t('common.loading') : t('auth.register') }}
      </button>
    </form>

    <AppGoogleSignInButton v-if="googleAuthEnabled" @click="startGoogleSignIn(returnTo || undefined)" />

    <div class="space-y-2 border-t border-brand-gray-200 pt-4">
      <button type="button" class="btn-secondary w-full py-3" @click="openRegister({ returnTo, role: 'ATHLETE' })">
        {{ t('auth.registerWithPhone') }}
      </button>
      <button type="button" class="btn-ghost w-full" @click="openLogin({ returnTo })">
        {{ t('auth.login') }}
      </button>
    </div>
  </div>
</template>
