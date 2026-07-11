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
    <h1 class="font-display text-2xl font-bold">{{ t('clubs.applyTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('clubs.applySubtitle') }}</p>
    <p v-if="submitted" class="venus-widget-card p-4 text-sm">{{ t('clubs.applySuccess') }}</p>
    <form v-else class="venus-form-stack" @submit.prevent="submit">
      <AppFormField :label="t('clubs.applyClubName')" required>
        <input v-model="clubName" class="neo-input" required />
      </AppFormField>
      <AppFormField :label="t('clubs.applyCity')" required>
        <input v-model="city" class="neo-input" required />
      </AppFormField>
      <AppFormField :label="t('clubs.applyContactName')" required>
        <input v-model="contactName" class="neo-input" required />
      </AppFormField>
      <AppFormField :label="t('auth.email')" required>
        <input v-model="contactEmail" type="email" dir="ltr" class="neo-input" required autocomplete="email" />
      </AppFormField>
      <AppFormField :label="t('clubs.applyPhone')">
        <input v-model="contactPhone" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <AppFormField :label="t('clubs.applySport')">
        <select v-model="sport" class="neo-select">
        <option value="padel">{{ t('sports.padel') }}</option>
        <option value="tennis">{{ t('sports.tennis') }}</option>
      </select>
      </AppFormField>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="submitting">{{ submitting ? t('common.loading') : t('clubs.applySubmit') }}</button>
    </form>
    <NuxtLink :to="localePath('/clubs')" class="block text-center text-sm text-brand-gray-600">{{ t('clubs.backToList') }}</NuxtLink>
  </div>
</template>
