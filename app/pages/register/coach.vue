<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: refreshAuth } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const clubId = ref('')
const bioFa = ref('')
const bioEn = ref('')
const sessionPrice = ref(400000)
const avatarUrl = ref('')
const credentialUrls = ref<string[]>([])
const error = ref('')
const submitting = ref(false)

const { data: clubs } = await useFetch<Array<{ id: string; nameFa: string; nameEn: string; city: string }>>('/api/clubs/options')

const returnTo = computed(() => typeof route.query.returnTo === 'string' ? route.query.returnTo : '')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    const result = await $fetch<{ redirectTo?: string }>('/api/auth/register-coach', {
      method: 'POST',
      body: {
        name: name.value,
        email: email.value,
        password: password.value,
        clubId: clubId.value,
        bioFa: bioFa.value,
        bioEn: bioEn.value,
        sessionPrice: sessionPrice.value,
        locale: locale.value,
        avatarUrl: avatarUrl.value,
        credentialUrls: credentialUrls.value,
      },
    })
    await refreshAuth()
    const safeReturnTo = sanitizeReturnTo(returnTo.value, locale.value === 'en' ? 'en' : 'fa')
    await navigateTo(safeReturnTo || result.redirectTo || localePath('/coach/profile'))
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
  <div class="mx-auto max-w-lg venus-form-stack pt-8">
    <h1 class="font-display text-xl font-bold">{{ t('register.coachTitle') }}</h1>
    <RegisterRolePicker active="coach" class="mt-4" />
    <p class="text-sm text-brand-gray-600">{{ t('register.coachSubtitle') }}</p>

    <AppFormField :label="t('auth.name')" required>
      <input v-model="name" class="neo-input" autocomplete="name" required />
    </AppFormField>
    <AppFormField :label="t('auth.email')" required>
      <input v-model="email" type="email" dir="ltr" class="neo-input" autocomplete="email" required />
    </AppFormField>
    <AppFormField :label="t('auth.password')" required>
      <input v-model="password" type="password" class="neo-input" autocomplete="new-password" required />
    </AppFormField>
    <AppFormField :label="t('register.selectClub')" required>
      <select v-model="clubId" class="neo-select" required>
        <option value="" disabled>{{ t('register.selectClubPlaceholder') }}</option>
        <option v-for="club in clubs || []" :key="club.id" :value="club.id">
          {{ club.nameFa }} — {{ club.city }}
        </option>
      </select>
    </AppFormField>
    <AppFormField :label="t('coach.bioFa')">
      <textarea v-model="bioFa" class="neo-textarea" rows="3" />
    </AppFormField>
    <AppFormField :label="t('coach.bioEn')">
      <textarea v-model="bioEn" class="neo-textarea" rows="3" dir="ltr" />
    </AppFormField>
    <AppFormField :label="t('owner.packagePage.coachPlaceholder')">
      <input v-model.number="sessionPrice" type="number" min="0" dir="ltr" class="neo-input tabular-nums" />
    </AppFormField>

    <AppImageUpload v-model="avatarUrl" :label="t('register.coachPhoto')" guest />
    <AppImageGallery v-model="credentialUrls" :label="t('register.coachCredentials')" guest :max="4" />

    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="button" class="btn-primary w-full" :disabled="submitting || !clubId" @click="submit">
      {{ submitting ? t('common.loading') : t('register.coachSubmit') }}
    </button>
    <NuxtLink :to="localePath('/login')" class="block text-center text-sm font-bold text-brand-navy underline">
      {{ t('auth.login') }}
    </NuxtLink>
  </div>
</template>
