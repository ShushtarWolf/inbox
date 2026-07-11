<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' , ssr: false})

const { locale, setLocale } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const { user, fetch } = useAuth()
const { data, pending, error, refresh } = await useAuthedFetch('/api/coach/profile')
const bioFa = ref('')
const bioEn = ref('')
const price = ref(0)
const profileLocale = ref<'fa' | 'en'>('fa')

watch(data, (d) => {
  if (d) {
    bioFa.value = d.bioFa || ''
    bioEn.value = d.bioEn || ''
    price.value = d.sessionPrice
  }
}, { immediate: true })

onMounted(async () => {
  await fetch()
  profileLocale.value = user.value?.locale === 'en' ? 'en' : 'fa'
})

async function save() {
  const previousLocale = locale.value
  await $fetch('/api/coach/profile', {
    method: 'PATCH',
    body: { bioFa: bioFa.value, bioEn: bioEn.value, sessionPrice: price.value, locale: profileLocale.value },
  })
  await setLocale(profileLocale.value)
  if (profileLocale.value !== previousLocale) {
    await navigateTo(switchLocalePath(profileLocale.value))
  }
  await fetch()
  refresh()
}
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('nav.profile') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
    <div class="venus-form-stack">
      <AppFormField :label="$t('coach.bioFa')">
        <textarea v-model="bioFa" class="neo-textarea" rows="3" />
      </AppFormField>
      <AppFormField :label="$t('coach.bioEn')">
        <textarea v-model="bioEn" class="neo-textarea" rows="3" dir="ltr" />
      </AppFormField>
      <AppFormField :label="$t('owner.packagePage.coachPlaceholder')">
        <input v-model.number="price" type="number" min="0" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <AppFormField :label="$t('common.language')">
        <select v-model="profileLocale" class="neo-select">
          <option value="fa">{{ $t('common.languageFa') }}</option>
          <option value="en">{{ $t('common.languageEn') }}</option>
        </select>
      </AppFormField>
      <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
    </div>
    </AppAsyncState>
  </div>
</template>
