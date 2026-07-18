<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency } = useFormatters()
const step = ref(1)
const saving = ref(false)
const saveError = ref('')
const finishError = ref('')

const profile = reactive({
  nameFa: '',
  nameEn: '',
  addressFa: '',
  addressEn: '',
  phone: '',
  openHour: 8,
  closeHour: 22,
})

type CourtRow = { id: string; nameFa: string; nameEn: string; price: number }
const courts = ref<CourtRow[]>([])
const newCourt = reactive({ nameFa: '', nameEn: '', price: 600000 })

const { data: settings, pending, error: fetchError, refresh: refreshSettings } = await useAuthedFetch('/api/owner/settings')
watchEffect(() => {
  if (!settings.value?.club) return
  const c = settings.value.club
  profile.nameFa = c.nameFa
  profile.nameEn = c.nameEn
  profile.addressFa = c.addressFa
  profile.addressEn = c.addressEn
  profile.phone = c.phone || ''
  profile.openHour = c.openHour
  profile.closeHour = c.closeHour
})

async function loadCourts() {
  courts.value = await $fetch<CourtRow[]>('/api/owner/courts')
}

onMounted(() => loadCourts())

const profileValid = computed(() =>
  Boolean(profile.nameFa.trim() && profile.nameEn.trim() && profile.addressFa.trim())
  && Number(profile.openHour) < Number(profile.closeHour),
)

const courtsReady = computed(() =>
  courts.value.length >= 1 && courts.value.some((court) => Number(court.price) > 0),
)

async function saveProfile() {
  if (!profileValid.value) {
    saveError.value = t('owner.setupValidationProfile')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/owner/settings', {
      method: 'PATCH',
      body: {
        nameFa: profile.nameFa.trim(),
        nameEn: profile.nameEn.trim(),
        addressFa: profile.addressFa.trim(),
        addressEn: profile.addressEn.trim() || profile.addressFa.trim(),
        phone: profile.phone.trim() || null,
        openHour: Number(profile.openHour),
        closeHour: Number(profile.closeHour),
      },
    })
    await refreshSettings()
    step.value = 2
  } catch {
    saveError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function addCourt() {
  if (!newCourt.nameFa.trim() || !newCourt.nameEn.trim()) {
    saveError.value = t('common.required')
    return
  }
  if (!(Number(newCourt.price) > 0)) {
    saveError.value = t('owner.setupValidationPrice')
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/owner/courts', {
      method: 'POST',
      body: {
        nameFa: newCourt.nameFa.trim(),
        nameEn: newCourt.nameEn.trim(),
        price: Number(newCourt.price),
      },
    })
    newCourt.nameFa = ''
    newCourt.nameEn = ''
    newCourt.price = 600000
    await loadCourts()
  } catch {
    saveError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function finish() {
  if (!courtsReady.value) {
    finishError.value = t('owner.setupValidationCourts')
    return
  }
  saving.value = true
  finishError.value = ''
  try {
    await $fetch('/api/owner/setup/complete', { method: 'POST' })
    await navigateTo(localePath('/owner'))
  } catch {
    finishError.value = t('owner.setupNotBookable')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4">
    <h1 class="tail-page-title">{{ t('owner.setupTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('owner.setupSubtitle') }}</p>
    <p class="text-xs text-brand-gray-500">{{ t('owner.setupNoCoachHint') }}</p>

    <ol class="flex gap-2 text-xs font-bold">
      <li :class="step === 1 ? 'text-brand-navy' : 'text-brand-gray-400'">1. {{ t('owner.setupProfile') }}</li>
      <li :class="step === 2 ? 'text-brand-navy' : 'text-brand-gray-400'">2. {{ t('owner.setupCourts') }}</li>
    </ol>

    <AppAsyncState :pending="pending" :error="fetchError" skeleton-variant="default">
      <p v-if="saveError || finishError" class="text-sm text-red-600">{{ saveError || finishError }}</p>

      <section v-if="step === 1" class="venus-form-stack ios-card p-4">
        <h2 class="font-bold">{{ t('owner.setupProfile') }}</h2>
        <AppFormField :label="t('owner.nameFa')">
          <input v-model="profile.nameFa" class="neo-input" required />
        </AppFormField>
        <AppFormField :label="t('owner.nameEn')">
          <input v-model="profile.nameEn" dir="ltr" class="neo-input" required />
        </AppFormField>
        <AppFormField :label="t('owner.addressFa')">
          <input v-model="profile.addressFa" class="neo-input" required />
        </AppFormField>
        <AppFormField :label="t('owner.phone')">
          <input v-model="profile.phone" dir="ltr" class="neo-input tabular-nums" />
        </AppFormField>
        <div class="grid grid-cols-2 gap-3">
          <AppFormField :label="t('owner.settings.openHour')">
            <input v-model.number="profile.openHour" type="number" min="0" max="23" class="neo-input" dir="ltr" />
          </AppFormField>
          <AppFormField :label="t('owner.settings.closeHour')">
            <input v-model.number="profile.closeHour" type="number" min="1" max="24" class="neo-input" dir="ltr" />
          </AppFormField>
        </div>
        <button type="button" class="btn-primary w-full" :disabled="saving || !profileValid" @click="saveProfile">
          {{ t('common.next') }}
        </button>
      </section>

      <section v-else class="venus-form-stack ios-card p-4">
        <h2 class="font-bold">{{ t('owner.setupCourts') }}</h2>
        <p class="text-xs text-brand-gray-500">{{ t('owner.setupCourtsHint') }}</p>
        <ul class="space-y-2 text-sm">
          <li v-for="court in courts" :key="court.id" class="ios-card flex items-center justify-between gap-2 p-2">
            <span class="font-bold">{{ court.nameFa }} / {{ court.nameEn }}</span>
            <span class="tabular-nums text-brand-gray-600" dir="ltr">{{ formatCurrency(court.price) }}</span>
          </li>
        </ul>
        <AppFormField :label="t('owner.courtNameFa')">
          <input v-model="newCourt.nameFa" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.courtNameEn')">
          <input v-model="newCourt.nameEn" dir="ltr" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.settings.courtPrice')">
          <input v-model.number="newCourt.price" type="number" min="1" step="1000" class="neo-input" dir="ltr" />
        </AppFormField>
        <button type="button" class="btn-secondary w-full" :disabled="saving" @click="addCourt">
          {{ t('owner.addCourt') }}
        </button>
        <button type="button" class="btn-primary w-full" :disabled="saving || !courtsReady" @click="finish">
          {{ t('owner.setupFinish') }}
        </button>
      </section>
    </AppAsyncState>
  </div>
</template>
