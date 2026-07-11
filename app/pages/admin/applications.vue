<script setup lang="ts">
definePageMeta({ layout: false, ssr: false })

useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { t } = useI18n()
const { secret, setSecret, clearSecret, adminFetch } = useAdminSecret()

const secretInput = ref('')
const authError = ref('')
const loadError = ref('')
const pending = ref(false)

type Application = {
  id: string
  clubName: string
  city: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  sportSlug: string
  status: string
  createdAt: string
}

const applications = ref<Application[]>([])
const approveTarget = ref<Application | null>(null)
const ownerEmail = ref('')
const approving = ref(false)
const approveError = ref('')
const approveResult = ref<{ temporaryPassword?: string; ownerEmail?: string } | null>(null)

async function loadApplications() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const data = await adminFetch<{ applications: Application[] }>('/api/admin/clubs/applications')
    applications.value = data.applications
  } catch {
    loadError.value = t('admin.invalidSecret')
    clearSecret()
  } finally {
    pending.value = false
  }
}

function submitSecret() {
  authError.value = ''
  if (!secretInput.value.trim()) {
    authError.value = t('admin.secretRequired')
    return
  }
  setSecret(secretInput.value)
  loadApplications()
}

function openApprove(app: Application) {
  approveTarget.value = app
  ownerEmail.value = app.contactEmail
  approveError.value = ''
  approveResult.value = null
}

function closeApprove() {
  approveTarget.value = null
  ownerEmail.value = ''
  approveError.value = ''
}

async function confirmApprove() {
  if (!approveTarget.value) return
  approving.value = true
  approveError.value = ''
  try {
    const result = await adminFetch<{ temporaryPassword?: string; ownerEmail: string }>(
      `/api/admin/clubs/${approveTarget.value.id}/approve`,
      { method: 'POST', body: { ownerEmail: ownerEmail.value.trim() } },
    )
    approveResult.value = result
    await loadApplications()
  } catch {
    approveError.value = t('common.error')
  } finally {
    approving.value = false
  }
}

watch(secret, (value) => {
  if (value) loadApplications()
}, { immediate: true })
</script>

<template>
  <div class="mx-auto min-h-screen max-w-4xl p-4 pt-8">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="font-display text-xl font-bold">{{ t('admin.title') }}</h1>
      <button v-if="secret" type="button" class="text-sm font-bold text-brand-navy underline" @click="clearSecret">
        {{ t('admin.logout') }}
      </button>
    </div>

    <div v-if="!secret" class="ios-card mx-auto max-w-sm p-6 venus-form-stack">
      <p class="text-sm text-brand-gray-600">{{ t('admin.secretPrompt') }}</p>
      <AppFormField :label="t('admin.secretLabel')">
        <input v-model="secretInput" type="password" class="neo-input" dir="ltr" @keyup.enter="submitSecret" />
      </AppFormField>
      <p v-if="authError" class="venus-alert-error">{{ authError }}</p>
      <button type="button" class="btn-primary w-full" @click="submitSecret">{{ t('admin.enter') }}</button>
    </div>

    <template v-else>
      <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
        <div v-if="applications.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
          {{ t('admin.noApplications') }}
        </div>
        <div v-else class="overflow-x-auto ios-card">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-start">
                <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
                <th class="p-3 font-bold">{{ t('admin.city') }}</th>
                <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
                <th class="p-3 font-bold">{{ t('admin.sport') }}</th>
                <th class="p-3 font-bold">{{ t('admin.status') }}</th>
                <th class="p-3 font-bold">{{ t('admin.date') }}</th>
                <th class="p-3 font-bold" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="app in applications" :key="app.id" class="border-b border-brand-gray-50">
                <td class="p-3 font-bold">{{ app.clubName }}</td>
                <td class="p-3">{{ app.city }}</td>
                <td class="p-3">
                  <div>{{ app.contactName }}</div>
                  <div class="text-brand-gray-600" dir="ltr">{{ app.contactEmail }}</div>
                </td>
                <td class="p-3">{{ app.sportSlug }}</td>
                <td class="p-3">{{ app.status }}</td>
                <td class="p-3 tabular-nums" dir="ltr">{{ new Date(app.createdAt).toLocaleDateString() }}</td>
                <td class="p-3">
                  <button
                    v-if="app.status === 'PENDING'"
                    type="button"
                    class="btn-primary text-xs"
                    @click="openApprove(app)"
                  >
                    {{ t('admin.approve') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppAsyncState>
    </template>

    <AppModal :open="!!approveTarget" :title="t('admin.approveTitle')" @close="closeApprove">
      <div class="venus-form-stack">
        <p class="text-sm">{{ approveTarget?.clubName }}</p>
        <AppFormField :label="t('admin.ownerEmail')">
          <input v-model="ownerEmail" type="email" dir="ltr" class="neo-input" />
        </AppFormField>
        <p v-if="approveError" class="venus-alert-error">{{ approveError }}</p>
        <div v-if="approveResult" class="venus-alert-success text-sm">
          <p>{{ t('admin.approveSuccess') }}</p>
          <p v-if="approveResult.temporaryPassword" dir="ltr">
            {{ t('admin.tempPassword') }}: <strong>{{ approveResult.temporaryPassword }}</strong>
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-primary flex-1" :disabled="approving" @click="confirmApprove">
            {{ t('admin.approve') }}
          </button>
          <button type="button" class="btn-secondary flex-1" @click="closeApprove">{{ t('common.close') }}</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
