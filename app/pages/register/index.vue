<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { fetch: refreshAuth, dashboardPathForRole } = useAuth()
const { startGoogleSignIn, googleAuthEnabled } = useGoogleAuth()

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
  if (role === 'owner') navigateTo(localePath({ path: '/register/owner', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
  else if (role === 'coach') navigateTo(localePath({ path: '/register/coach', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
})

function redirectTo(target: string) {
  if (import.meta.client) {
    return router.push(target)
  }
  return navigateTo(target)
}

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    const user = await $fetch<{ role: string }>('/api/auth/register', {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value, locale: 'fa' },
    })
    await refreshAuth()
    const safeReturnTo = sanitizeReturnTo(returnTo.value, 'fa')
    if (safeReturnTo) {
      await redirectTo(safeReturnTo)
      return
    }
    if (user.role === 'CLUB_ADMIN') await redirectTo(dashboardPathForRole('CLUB_ADMIN'))
    else if (user.role === 'COACH') await redirectTo(dashboardPathForRole('COACH'))
    else await redirectTo(dashboardPathForRole('ATHLETE'))
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    error.value = status === 409 ? t('auth.emailTaken') : t('auth.registerFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm venus-form-stack pt-8">
    <h1 class="font-display text-xl font-bold">{{ t('auth.register') }}</h1>
    <RegisterRolePicker active="athlete" class="mt-4" />
    <p class="text-sm font-bold text-brand-gray-600">{{ t('register.athleteSubtitle') }}</p>
    <AppFormField field-id="register-name" :label="t('auth.name')">
      <input id="register-name" v-model="name" class="neo-input" autocomplete="name" />
    </AppFormField>
    <AppFormField field-id="register-email" :label="t('auth.email')">
      <input id="register-email" v-model="email" type="email" dir="ltr" class="neo-input" autocomplete="email" />
    </AppFormField>
    <AppFormField field-id="register-password" :label="t('auth.password')">
      <input id="register-password" v-model="password" type="password" class="neo-input" autocomplete="new-password" />
    </AppFormField>
    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="button" class="btn-primary w-full" :disabled="submitting || !name.trim() || !email.trim() || !password.trim()" @click="submit">
      {{ submitting ? t('common.loading') : t('auth.register') }}
    </button>
    <AppGoogleSignInButton v-if="googleAuthEnabled" @click="startGoogleSignIn(returnTo)" />
    <NuxtLink :to="localePath({ path: '/login', query: returnTo ? { returnTo } : {} })" class="block text-center text-sm font-bold text-brand-navy underline">
      {{ t('auth.login') }}
    </NuxtLink>
  </div>
</template>
