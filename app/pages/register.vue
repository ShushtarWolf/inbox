<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { fetch: refreshAuth, dashboardPathForRole } = useAuth()
const { startGoogleSignIn } = useGoogleAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
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
      body: { name: name.value, email: email.value, password: password.value, role: 'ATHLETE', locale: locale.value },
    })
    await refreshAuth()
    const urlLocale = locale.value === 'en' ? 'en' : 'fa'
    const safeReturnTo = sanitizeReturnTo(returnTo.value, urlLocale)
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
    <p class="text-sm font-bold text-brand-gray-600">{{ t('register.athleteSubtitle') }}</p>
    <AppFormField :label="t('auth.name')">
      <input v-model="name" class="neo-input" autocomplete="name" />
    </AppFormField>
    <AppFormField :label="t('auth.email')">
      <input v-model="email" type="email" dir="ltr" class="neo-input" autocomplete="email" />
    </AppFormField>
    <AppFormField :label="t('auth.password')">
      <input v-model="password" type="password" class="neo-input" autocomplete="new-password" />
    </AppFormField>
    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="button" class="btn-primary w-full" :disabled="submitting || !name.trim() || !email.trim() || !password.trim()" @click="submit">
      {{ submitting ? t('common.loading') : t('auth.register') }}
    </button>
    <button type="button" class="btn-secondary w-full" @click="startGoogleSignIn(returnTo)">
      {{ t('auth.google') }}
    </button>
    <NuxtLink :to="localePath({ path: '/login', query: returnTo ? { returnTo } : {} })" class="block text-center text-sm font-bold text-brand-navy underline">
      {{ t('auth.login') }}
    </NuxtLink>
    <div class="space-y-1 text-center text-xs text-brand-gray-600">
      <NuxtLink :to="localePath('/register/owner')" class="block font-bold text-brand-navy underline">{{ t('register.ownerLink') }}</NuxtLink>
      <NuxtLink :to="localePath('/register/coach')" class="block font-bold text-brand-navy underline">{{ t('register.coachLink') }}</NuxtLink>
    </div>
  </div>
</template>
