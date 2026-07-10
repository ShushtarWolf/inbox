<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { fetch: refreshAuth, dashboardPathForRole } = useAuth()

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
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-black">{{ t('auth.register') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('auth.athleteOnlyNote') }}</p>
    <input v-model="name" :placeholder="t('auth.name')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="email" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="password" type="password" :placeholder="t('auth.password')" class="w-full rounded-xl border px-3 py-2" />
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <button type="button" class="btn-primary w-full" :disabled="submitting" @click="submit">
      {{ submitting ? t('common.loading') : t('auth.register') }}
    </button>
    <NuxtLink :to="localePath({ path: '/login', query: returnTo ? { returnTo } : {} })" class="block text-center text-sm text-brand-gray-600">
      {{ t('auth.login') }}
    </NuxtLink>
  </div>
</template>
