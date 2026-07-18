<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()

const email = ref('')
const name = ref('')
const clubName = ref('')
const submitting = ref(false)
const formError = ref('')
const result = ref<{
  email: string
  temporaryPassword: string
  role: string
  clubId?: string | null
  clubSlug?: string | null
  clubName?: string | null
} | null>(null)

async function submit() {
  if (!secret.value) return
  formError.value = ''
  result.value = null
  if (!email.value.trim() || !name.value.trim()) {
    formError.value = t('common.required')
    return
  }
  submitting.value = true
  try {
    const data = await adminFetch<{
      email: string
      temporaryPassword: string
      role: string
      clubId?: string | null
      clubSlug?: string | null
      clubName?: string | null
    }>(
      '/api/admin/provision',
      {
        method: 'POST',
        body: {
          type: 'CLUB_ADMIN',
          email: email.value.trim(),
          name: name.value.trim(),
          clubName: clubName.value.trim() || undefined,
          locale: 'fa',
        },
      },
    )
    result.value = data
    email.value = ''
    name.value = ''
    clubName.value = ''
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      formError.value = t('admin.invalidSecret')
      clearSecret()
    } else if (status === 409) {
      formError.value = t('admin.provisionEmailExists')
    } else {
      formError.value = t('common.error')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.provisionTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.provisionSubtitle') }}</p>

    <div class="ios-card mx-auto max-w-lg p-6 venus-form-stack">
      <p class="rounded-lg bg-brand-gray-50 p-3 text-xs text-brand-gray-600">
        {{ t('admin.provisionNote') }}
      </p>
      <AppFormField :label="t('admin.ownerEmail')">
        <input v-model="email" type="email" class="neo-input" dir="ltr" autocomplete="off" />
      </AppFormField>
      <AppFormField :label="t('common.name')">
        <input v-model="name" type="text" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('admin.clubName')">
        <input v-model="clubName" type="text" class="neo-input" :placeholder="t('admin.clubNameOptional')" />
      </AppFormField>
      <p v-if="formError" class="venus-alert-error">{{ formError }}</p>
      <div v-if="result" class="venus-alert-success space-y-1 text-sm">
        <p>{{ t('admin.provisionSuccess') }}</p>
        <p dir="ltr">{{ result.email }}</p>
        <p dir="ltr">
          {{ t('admin.tempPassword') }}: <strong>{{ result.temporaryPassword }}</strong>
        </p>
        <p v-if="result.clubSlug" class="text-xs">
          {{ t('admin.provisionNextSteps', { slug: result.clubSlug }) }}
        </p>
        <NuxtLink
          v-if="result.clubId"
          :to="localePath(`/admin/clubs/${result.clubId}`)"
          class="inline-block text-xs font-bold underline"
        >
          {{ t('admin.clubDetails') }}
        </NuxtLink>
      </div>
      <button type="button" class="btn-primary w-full" :disabled="submitting" @click="submit">
        {{ submitting ? t('common.loading') : t('admin.provisionSubmit') }}
      </button>
    </div>
  </div>
</template>
