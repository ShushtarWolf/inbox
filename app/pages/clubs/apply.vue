<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

const clubName = ref('')
const city = ref('')
const contactName = ref('')
const contactEmail = ref('')
const contactPhone = ref('')
const sport = ref('padel')
const submitted = ref(false)
const error = ref('')
const submitting = ref(false)

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/clubs/apply', {
      method: 'POST',
      body: {
        clubName: clubName.value,
        city: city.value,
        contactName: contactName.value,
        contactEmail: contactEmail.value,
        contactPhone: contactPhone.value,
        sport: sport.value,
      },
    })
    submitted.value = true
  } catch {
    error.value = t('clubs.applyFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 py-8">
    <h1 class="font-display text-2xl font-black">{{ t('clubs.applyTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('clubs.applySubtitle') }}</p>
    <p v-if="submitted" class="rounded-xl border bg-brand-cream p-4 text-sm">{{ t('clubs.applySuccess') }}</p>
    <form v-else class="space-y-3" @submit.prevent="submit">
      <input v-model="clubName" :placeholder="t('clubs.applyClubName')" class="w-full rounded-xl border px-3 py-2" required />
      <input v-model="city" :placeholder="t('clubs.applyCity')" class="w-full rounded-xl border px-3 py-2" required />
      <input v-model="contactName" :placeholder="t('clubs.applyContactName')" class="w-full rounded-xl border px-3 py-2" required />
      <input v-model="contactEmail" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" required />
      <input v-model="contactPhone" :placeholder="t('clubs.applyPhone')" class="w-full rounded-xl border px-3 py-2" />
      <select v-model="sport" class="w-full rounded-xl border px-3 py-2">
        <option value="padel">{{ t('sports.padel') }}</option>
        <option value="tennis">{{ t('sports.tennis') }}</option>
      </select>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="submitting">{{ submitting ? t('common.loading') : t('clubs.applySubmit') }}</button>
    </form>
    <NuxtLink :to="localePath('/clubs')" class="block text-center text-sm text-brand-gray-600">{{ t('clubs.backToList') }}</NuxtLink>
  </div>
</template>
