<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { fetch: fetchAuth } = useAuth()
const { formatNumber } = useFormatters()

const clubNameFa = ref('')
const city = ref('تهران')
const addressFa = ref('')
const sport = ref<'padel' | 'tennis' | 'both'>('padel')
const courtCount = ref<1 | 2 | 3>(1)
const credentialUrls = ref<string[]>([])
const pending = ref(false)
const error = ref('')

const sportOptions = [
  { value: 'tennis' as const, labelKey: 'auth.sportTennis' },
  { value: 'padel' as const, labelKey: 'auth.sportPadel' },
  { value: 'both' as const, labelKey: 'auth.sportBoth' },
]

const courtCountOptions = [
  { value: 1 as const, labelKey: 'auth.courtCount1' },
  { value: 2 as const, labelKey: 'auth.courtCount2' },
  { value: 3 as const, labelKey: 'auth.courtCount3Plus' },
]

const {
  uploading: licenseUploading,
  error: licenseUploadError,
  accept: licenseAccept,
  askPick: licenseAskPick,
  upload: uploadLicense,
} = useImageUpload({ guest: true })
const licenseInputRef = ref<HTMLInputElement | null>(null)
const licenseName = ref('')

function openLicensePicker() {
  if (licenseUploading.value) return
  licenseAskPick(() => licenseInputRef.value?.click())
}

async function onLicenseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const result = await uploadLicense(file)
  if (!result?.url) {
    error.value = licenseUploadError.value || t('upload.failed')
    return
  }
  credentialUrls.value = [result.url]
  licenseName.value = file.name
}

async function submit() {
  error.value = ''
  if (!clubNameFa.value.trim()) {
    error.value = t('owner.addClub.validationName')
    return
  }
  pending.value = true
  try {
    const data = await $fetch<{
      club: { id: string; status: string }
      setupHandoff?: string | null
      switched?: boolean
    }>('/api/owner/clubs', {
      method: 'POST',
      body: {
        clubNameFa: clubNameFa.value.trim(),
        city: city.value.trim() || undefined,
        addressFa: addressFa.value.trim() || undefined,
        sport: sport.value,
        courtCount: courtCount.value,
        credentialUrls: credentialUrls.value.length ? credentialUrls.value : undefined,
        switchToNew: true,
      },
    })
    await fetchAuth()
    if (data.setupHandoff === 'sport-both') {
      await navigateTo(localePath('/owner/setup?handoff=sport-both'))
      return
    }
  if (data.club.status === 'PENDING') {
      await navigateTo(localePath('/owner/pending'))
      return
    }
    await navigateTo(localePath('/owner/calendar'))
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) error.value = t('owner.addClub.forbidden')
    else if (status === 400) error.value = t('owner.addClub.validationName')
    else error.value = t('owner.addClub.failed')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack canva-cal-sheet -mx-4 min-[431px]:mx-0">
    <header class="text-start">
      <h1 class="text-base font-bold text-brand-navy">{{ t('owner.addClub.title') }}</h1>
      <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.addClub.subtitle') }}</p>
    </header>

    <form class="space-y-4" novalidate @submit.prevent="submit">
      <AppFormField field-id="owner-new-club-name" :label="t('auth.clubName')">
        <input id="owner-new-club-name" v-model="clubNameFa" class="neo-input" required />
      </AppFormField>
      <AppFormField field-id="owner-new-club-city" :label="t('owner.addClub.city')">
        <input id="owner-new-club-city" v-model="city" class="neo-input" />
      </AppFormField>
      <AppFormField field-id="owner-new-club-address" :label="t('auth.addressRegion')">
        <input id="owner-new-club-address" v-model="addressFa" class="neo-input" />
      </AppFormField>
      <AppFormField field-id="owner-new-club-sport" :label="t('auth.sport')">
        <select id="owner-new-club-sport" v-model="sport" class="neo-select">
          <option v-for="opt in sportOptions" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
      </AppFormField>
      <AppFormField field-id="owner-new-club-courts" :label="t('auth.courtCount')">
        <select id="owner-new-club-courts" v-model.number="courtCount" class="neo-select">
          <option v-for="opt in courtCountOptions" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
      </AppFormField>
      <p class="text-start text-[10px] text-brand-gray-500">
        {{ t('owner.addClub.courtCountHint', { n: formatNumber(courtCount) }) }}
      </p>

      <div class="canva-auth-upload">
        <div class="min-w-0 flex-1 text-start">
          <p class="text-xs font-bold text-brand-navy">{{ t('auth.licenseUpload') }}</p>
          <p class="mt-0.5 text-[10px] text-brand-gray-500">{{ t('auth.licenseHint') }}</p>
          <p v-if="licenseName" class="mt-1 truncate text-[10px] text-brand-primary">{{ licenseName }}</p>
        </div>
        <button
          type="button"
          class="canva-auth-upload-btn"
          :disabled="licenseUploading"
          @click="openLicensePicker"
        >
          {{ licenseUploading ? t('common.loading') : t('auth.selectFile') }}
        </button>
        <input
          ref="licenseInputRef"
          type="file"
          class="pointer-events-none sr-only"
          :accept="licenseAccept"
          :disabled="licenseUploading"
          @change="onLicenseFile"
        >
      </div>

      <p v-if="error" class="text-start text-xs font-bold text-brand-primary">{{ error }}</p>

      <button type="submit" class="canva-gate-btn-primary w-full" :disabled="pending">
        {{ pending ? t('common.loading') : t('owner.addClub.submit') }}
      </button>
    </form>
  </div>
</template>