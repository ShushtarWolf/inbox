<script setup lang="ts">
import { sanitizeReturnTo } from '#shared/returnTo.ts'

definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: refreshAuth } = useAuth()
const { openRegister } = useAuthFlow()

const name = ref('')
const email = ref('')
const password = ref('')
const phone = ref('')
const clubNameFa = ref('')
const clubNameEn = ref('')
const city = ref('')
const addressFa = ref('')
const addressEn = ref('')
const sport = ref('padel')
const avatarUrl = ref('')
const clubImage = ref('')
const galleryUrls = ref<string[]>([])
const credentialUrls = ref<string[]>([])
const error = ref('')
const submitting = ref(false)

const returnTo = computed(() => typeof route.query.returnTo === 'string' ? route.query.returnTo : '')

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    const result = await $fetch<{ redirectTo?: string }>('/api/auth/register-owner', {
      method: 'POST',
      body: {
        name: name.value,
        email: email.value,
        password: password.value,
        phone: phone.value,
        clubNameFa: clubNameFa.value,
        clubNameEn: clubNameEn.value,
        city: city.value,
        addressFa: addressFa.value,
        addressEn: addressEn.value,
        sport: sport.value,
        locale: locale.value,
        avatarUrl: avatarUrl.value,
        clubImage: clubImage.value,
        galleryUrls: galleryUrls.value,
        credentialUrls: credentialUrls.value,
      },
    })
    await refreshAuth()
    const safeReturnTo = sanitizeReturnTo(returnTo.value, locale.value === 'en' ? 'en' : 'fa')
    await navigateTo(safeReturnTo || result.redirectTo || localePath('/owner/setup'))
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
    <h1 class="font-display text-xl font-bold">{{ t('register.ownerTitle') }}</h1>
    <RegisterRolePicker active="owner" class="mt-4" />
    <p class="text-sm text-brand-gray-600">{{ t('register.ownerSubtitle') }}</p>
    <button type="button" class="btn-primary w-full" @click="openRegister({ returnTo, role: 'CLUB_ADMIN' })">
      {{ t('auth.registerWithPhone') }}
    </button>
    <p class="text-center text-xs font-bold text-brand-gray-600">{{ t('auth.emailPasswordFallback') }}</p>

    <AppFormField :label="t('auth.name')" required>
      <input v-model="name" class="neo-input" autocomplete="name" required />
    </AppFormField>
    <AppFormField :label="t('auth.email')" required>
      <input v-model="email" type="email" dir="ltr" class="neo-input" autocomplete="email" required />
    </AppFormField>
    <AppFormField :label="t('auth.password')" required>
      <input v-model="password" type="password" class="neo-input" autocomplete="new-password" required />
    </AppFormField>
    <AppFormField :label="t('common.mobile')">
      <input v-model="phone" dir="ltr" class="neo-input tabular-nums" />
    </AppFormField>

    <AppFormField :label="t('register.clubNameFa')" required>
      <input v-model="clubNameFa" class="neo-input" required />
    </AppFormField>
    <AppFormField :label="t('register.clubNameEn')">
      <input v-model="clubNameEn" dir="ltr" class="neo-input" />
    </AppFormField>
    <AppFormField :label="t('owner.settingsPage.city')" required>
      <input v-model="city" class="neo-input" required />
    </AppFormField>
    <AppFormField :label="t('owner.settingsPage.addressFa')" required>
      <input v-model="addressFa" class="neo-input" required />
    </AppFormField>
    <AppFormField :label="t('owner.settingsPage.addressEn')">
      <input v-model="addressEn" dir="ltr" class="neo-input" />
    </AppFormField>
    <AppFormField :label="t('clubs.applySport')">
      <select v-model="sport" class="neo-select">
        <option value="padel">{{ t('sports.padel') }}</option>
        <option value="tennis">{{ t('sports.tennis') }}</option>
      </select>
    </AppFormField>

    <AppImageUpload v-model="avatarUrl" :label="t('register.ownerPhoto')" guest />
    <AppImageUpload v-model="clubImage" :label="t('register.clubCover')" guest placeholder="/placeholders/club.svg" />
    <AppImageGallery v-model="galleryUrls" :label="t('register.clubGallery')" guest />
    <AppImageGallery v-model="credentialUrls" :label="t('register.clubCredentials')" guest :max="4" />

    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="button" class="btn-primary w-full" :disabled="submitting" @click="submit">
      {{ submitting ? t('common.loading') : t('register.ownerSubmit') }}
    </button>
    <NuxtLink :to="localePath('/login')" class="block text-center text-sm font-bold text-brand-navy underline">
      {{ t('auth.login') }}
    </NuxtLink>
  </div>
</template>
