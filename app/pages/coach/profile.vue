<script setup lang="ts">
definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH' })

const { setLocale } = useI18n()
const { user, fetch } = useAuth()
const { data, refresh } = await useAuthedFetch('/api/coach/profile')
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
  await $fetch('/api/coach/profile', {
    method: 'PATCH',
    body: { bioFa: bioFa.value, bioEn: bioEn.value, sessionPrice: price.value, locale: profileLocale.value },
  })
  await setLocale(profileLocale.value)
  await fetch()
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('nav.profile') }}</h1>
    <textarea v-model="bioFa" :placeholder="$t('coach.bioFa')" class="w-full rounded-xl border p-2" rows="3" />
    <textarea v-model="bioEn" :placeholder="$t('coach.bioEn')" class="w-full rounded-xl border p-2" rows="3" />
    <input v-model.number="price" type="number" class="w-full rounded-xl border px-3 py-2" />
    <select v-model="profileLocale" class="w-full rounded-xl border px-3 py-2">
      <option value="fa">{{ $t('common.languageFa') }}</option>
      <option value="en">{{ $t('common.languageEn') }}</option>
    </select>
    <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
  </div>
</template>
