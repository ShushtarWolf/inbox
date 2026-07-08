<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' })

const { user, fetch } = useAuth()
const { setLocale } = useI18n()
const name = ref('')
const phone = ref('')
const profileLocale = ref<'fa' | 'en'>('fa')

onMounted(async () => {
  await fetch()
  name.value = user.value?.name || ''
  phone.value = user.value?.phone || ''
  profileLocale.value = user.value?.locale === 'en' ? 'en' : 'fa'
})

async function save() {
  await $fetch('/api/profile', { method: 'PATCH', body: { name: name.value, phone: phone.value, locale: profileLocale.value } })
  await setLocale(profileLocale.value)
  await fetch()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('nav.profile') }}</h1>
    <input v-model="name" :placeholder="$t('common.name')" class="w-full rounded-xl border px-3 py-2" />
    <input v-model="phone" :placeholder="$t('common.mobile')" class="w-full rounded-xl border px-3 py-2" />
    <select v-model="profileLocale" class="w-full rounded-xl border px-3 py-2">
      <option value="fa">{{ $t('common.languageFa') }}</option>
      <option value="en">{{ $t('common.languageEn') }}</option>
    </select>
    <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
  </div>
</template>
