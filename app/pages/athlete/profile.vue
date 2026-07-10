<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const { user, fetch } = useAuth()
const { locale, setLocale } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const localePath = useLocalePath()
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
  const previousLocale = locale.value
  await $fetch('/api/profile', { method: 'PATCH', body: { name: name.value, phone: phone.value, locale: profileLocale.value } })
  await setLocale(profileLocale.value)
  if (profileLocale.value !== previousLocale) {
    await navigateTo(switchLocalePath(profileLocale.value))
  }
  await fetch()
}
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="$t('nav.profile')" :home-to="localePath('/')" :back-to="localePath('/athlete')" />
    <input v-model="name" :placeholder="$t('common.name')" class="neo-input" />
    <input v-model="phone" dir="ltr" :placeholder="$t('common.mobile')" class="neo-input tabular-nums" />
    <select v-model="profileLocale" class="neo-input">
      <option value="fa">{{ $t('common.languageFa') }}</option>
      <option value="en">{{ $t('common.languageEn') }}</option>
    </select>
    <button type="button" class="btn-primary w-full" @click="save">{{ $t('common.save') }}</button>
  </div>
</template>
