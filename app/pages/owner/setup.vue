<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const step = ref(1)
const saving = ref(false)
const saveError = ref('')

const profile = reactive({
  nameFa: '',
  nameEn: '',
  addressFa: '',
  addressEn: '',
  phone: '',
  openHour: 8,
  closeHour: 22,
})

const courts = ref<{ id: string; nameFa: string; nameEn: string; price: number }[]>([])
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
  courts.value = await $fetch('/api/owner/courts')
}

onMounted(() => loadCourts())

async function saveProfile() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch('/api/owner/settings', {
      method: 'PATCH',
      body: { ...profile },
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
  saving.value = true
  try {
    await $fetch('/api/owner/courts', { method: 'POST', body: { ...newCourt } })
    newCourt.nameFa = ''
    newCourt.nameEn = ''
    await loadCourts()
  } finally {
    saving.value = false
  }
}

function finish() {
  navigateTo(localePath('/owner'))
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4">
    <h1 class="tail-page-title">{{ t('owner.setupTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('owner.setupSubtitle') }}</p>
    <AppAsyncState :pending="pending" :error="fetchError" skeleton-variant="default">
    <p v-if="saveError" class="text-sm text-red-600">{{ saveError }}</p>

    <section v-if="step === 1" class="venus-form-stack ios-card p-4">
      <h2 class="font-bold">{{ t('owner.setupProfile') }}</h2>
      <AppFormField :label="t('owner.nameFa')">
        <input v-model="profile.nameFa" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('owner.nameEn')">
        <input v-model="profile.nameEn" dir="ltr" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('owner.addressFa')">
        <input v-model="profile.addressFa" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('owner.phone')">
        <input v-model="profile.phone" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <button type="button" class="btn-primary w-full" :disabled="saving" @click="saveProfile">{{ t('common.next') }}</button>
    </section>

    <section v-else class="venus-form-stack ios-card p-4">
      <h2 class="font-bold">{{ t('owner.setupCourts') }}</h2>
      <ul class="space-y-2 text-sm">
        <li v-for="court in courts" :key="court.id" class="ios-card p-2 font-bold">{{ court.nameFa }} / {{ court.nameEn }}</li>
      </ul>
      <AppFormField :label="t('owner.courtNameFa')">
        <input v-model="newCourt.nameFa" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('owner.courtNameEn')">
        <input v-model="newCourt.nameEn" dir="ltr" class="neo-input" />
      </AppFormField>
      <button type="button" class="btn-secondary w-full" :disabled="saving" @click="addCourt">{{ t('owner.addCourt') }}</button>
      <button type="button" class="btn-primary w-full" @click="finish">{{ t('owner.setupFinish') }}</button>
    </section>
    </AppAsyncState>
  </div>
</template>
