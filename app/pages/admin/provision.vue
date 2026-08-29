<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { formatPhone } = useFormatters()
const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()

const email = ref('')
const name = ref('')
const phone = ref('')
const clubName = ref('')
const submitting = ref(false)
const formError = ref('')
const copied = ref(false)
const result = ref<{
  email: string
  phone?: string | null
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
  copied.value = false
  if (!email.value.trim() || !name.value.trim() || !phone.value.trim()) {
    formError.value = t('common.required')
    return
  }
  submitting.value = true
  try {
    const data = await adminFetch<{
      email: string
      phone?: string | null
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
          phone: phone.value.trim(),
          clubName: clubName.value.trim() || undefined,
          locale: 'fa',
        },
      },
    )
    result.value = data
    email.value = ''
    name.value = ''
    phone.value = ''
    clubName.value = ''
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      formError.value = t('admin.invalidSecret')
      clearSecret()
    } else if (status === 409) {
      formError.value = t('admin.provisionEmailExists')
    } else if (status === 503) {
      formError.value = t('admin.provisionUnavailable')
    } else if (status === 400) {
      formError.value = t('common.required')
    } else {
      formError.value = t('common.error')
    }
  } finally {
    submitting.value = false
  }
}

async function copyTempPassword() {
  const pw = result.value?.temporaryPassword
  if (!pw || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(pw)
    copied.value = true
  } catch {
    copied.value = false
  }
}

function resetForm() {
  result.value = null
  formError.value = ''
  copied.value = false
}
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.provisionTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.provisionSubtitle') }}</p>

    <div
      class="mx-auto max-w-lg border border-brand-gray-200 bg-white p-5 venus-form-stack"
      style="border-radius: 2px;"
    >
      <p
        class="border border-brand-gray-100 bg-brand-gray-50 p-3 text-start text-xs leading-relaxed text-brand-gray-600"
        style="border-radius: 2px;"
      >
        {{ t('admin.provisionNote') }}
      </p>
      <p class="text-start text-xs text-brand-gray-500">
        {{ t('admin.provisionPhoneHint') }}
      </p>
      <p class="text-start text-xs text-brand-gray-500">
        {{ t('admin.provisionNoSecretLeak') }}
      </p>

      <form class="venus-form-stack" @submit.prevent="submit">
        <AppFormField field-id="provision-email" :label="t('admin.ownerEmail')">
          <input
            id="provision-email"
            v-model="email"
            type="email"
            required
            class="neo-input"
            style="border-radius: 2px;"
            dir="ltr"
            autocomplete="off"
            :disabled="submitting"
          />
        </AppFormField>
        <AppFormField field-id="provision-name" :label="t('common.name')">
          <input
            id="provision-name"
            v-model="name"
            type="text"
            required
            class="neo-input"
            style="border-radius: 2px;"
            autocomplete="off"
            :disabled="submitting"
          />
        </AppFormField>
        <AppFormField field-id="provision-phone" :label="t('admin.ownerPhone')">
          <input
            id="provision-phone"
            v-model="phone"
            type="tel"
            required
            class="neo-input"
            style="border-radius: 2px;"
            dir="ltr"
            inputmode="tel"
            autocomplete="tel"
            placeholder="09xxxxxxxxx"
            :disabled="submitting"
          />
        </AppFormField>
        <AppFormField field-id="provision-club" :label="t('admin.clubName')">
          <input
            id="provision-club"
            v-model="clubName"
            type="text"
            class="neo-input"
            style="border-radius: 2px;"
            :placeholder="t('admin.clubNameOptional')"
            :disabled="submitting"
          />
        </AppFormField>

        <p v-if="formError" class="venus-alert-error text-start" role="alert">{{ formError }}</p>

        <div
          v-if="result"
          class="venus-alert-success space-y-2 text-start text-sm"
          role="status"
        >
          <p class="font-bold">{{ t('admin.provisionSuccess') }}</p>
          <p dir="ltr">{{ result.email }} · {{ result.role }}</p>
          <p v-if="result.phone" class="text-xs" dir="ltr">{{ formatPhone(result.phone) }}</p>
          <p v-if="result.clubName" class="text-xs">
            {{ result.clubName }}
            <span v-if="result.clubSlug" dir="ltr"> · {{ result.clubSlug }}</span>
          </p>

          <div
            class="border border-emerald-200 bg-white/80 p-3"
            style="border-radius: 2px;"
          >
            <p class="text-xs font-bold text-brand-navy">{{ t('admin.tempPassword') }}</p>
            <p class="mt-1 break-all font-mono text-sm" dir="ltr">
              <strong>{{ result.temporaryPassword }}</strong>
            </p>
            <p class="mt-1 text-xs text-brand-gray-600">{{ t('admin.provisionTempPasswordHint') }}</p>
            <button
              type="button"
              class="mt-2 border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
              style="border-radius: 2px;"
              @click="copyTempPassword"
            >
              {{ copied ? t('admin.copied') : t('admin.copyTempPassword') }}
            </button>
          </div>

          <p v-if="result.clubSlug" class="text-xs text-brand-gray-700">
            {{ t('admin.provisionNextSteps', { slug: result.clubSlug }) }}
          </p>
          <div class="flex flex-wrap gap-3">
            <NuxtLink
              v-if="result.clubId"
              :to="localePath(`/admin/clubs/${result.clubId}`)"
              class="text-xs font-bold text-brand-navy underline"
            >
              {{ t('admin.clubDetails') }}
            </NuxtLink>
            <NuxtLink
              v-if="result.clubSlug"
              :to="localePath(`/clubs/${result.clubSlug}`)"
              class="text-xs font-bold text-brand-navy underline"
              dir="ltr"
            >
              /clubs/{{ result.clubSlug }}
            </NuxtLink>
            <button
              type="button"
              class="text-xs font-bold text-brand-navy underline"
              @click="resetForm"
            >
              {{ t('admin.provisionAnother') }}
            </button>
          </div>
        </div>

        <button
          type="submit"
          class="inline-flex w-full items-center justify-center bg-brand-primary px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
          style="border-radius: 2px;"
          :disabled="submitting"
        >
          {{ submitting ? t('common.loading') : t('admin.provisionSubmit') }}
        </button>
      </form>
    </div>
  </div>
</template>
