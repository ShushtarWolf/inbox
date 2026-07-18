<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()

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
const pending = ref(false)
const loadError = ref('')
const approveTarget = ref<Application | null>(null)
const ownerEmail = ref('')
const approving = ref(false)
const approveError = ref('')
const approveResult = ref<{ temporaryPassword?: string; ownerEmail?: string; clubSlug?: string } | null>(null)
const rejectingId = ref<string | null>(null)

const createForm = reactive({
  clubName: '',
  city: 'تهران',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  sport: 'padel',
})
const creating = ref(false)
const createError = ref('')
const createSuccess = ref('')

async function loadApplications() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const data = await adminFetch<{ applications: Application[] }>('/api/admin/clubs/applications')
    applications.value = data.applications
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

async function createApplication() {
  createError.value = ''
  createSuccess.value = ''
  if (!createForm.clubName.trim() || !createForm.city.trim() || !createForm.contactName.trim() || !createForm.contactEmail.trim()) {
    createError.value = t('common.required')
    return
  }
  creating.value = true
  try {
    await adminFetch('/api/admin/clubs/applications', {
      method: 'POST',
      body: {
        clubName: createForm.clubName.trim(),
        city: createForm.city.trim(),
        contactName: createForm.contactName.trim(),
        contactEmail: createForm.contactEmail.trim(),
        contactPhone: createForm.contactPhone.trim() || undefined,
        sport: createForm.sport,
      },
    })
    createSuccess.value = t('admin.createApplicationSuccess')
    createForm.clubName = ''
    createForm.contactName = ''
    createForm.contactEmail = ''
    createForm.contactPhone = ''
    await loadApplications()
  } catch {
    createError.value = t('common.error')
  } finally {
    creating.value = false
  }
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
    const result = await adminFetch<{ temporaryPassword?: string; ownerEmail: string; clubSlug?: string }>(
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

async function rejectApplication(app: Application) {
  if (!confirm(t('admin.rejectConfirm'))) return
  rejectingId.value = app.id
  try {
    await adminFetch(`/api/admin/clubs/${app.id}/reject`, { method: 'POST' })
    await loadApplications()
  } catch {
    loadError.value = t('common.error')
  } finally {
    rejectingId.value = null
  }
}

watch(secret, (value) => {
  if (value) loadApplications()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.applicationsTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.applicationsSubtitle') }}</p>

    <section class="ios-card mx-auto max-w-lg p-4 venus-form-stack">
      <h2 class="font-bold">{{ t('admin.createApplicationTitle') }}</h2>
      <p class="text-xs text-brand-gray-500">{{ t('admin.createApplicationHint') }}</p>
      <AppFormField :label="t('admin.clubName')">
        <input v-model="createForm.clubName" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('admin.city')">
        <input v-model="createForm.city" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('common.name')">
        <input v-model="createForm.contactName" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('admin.ownerEmail')">
        <input v-model="createForm.contactEmail" type="email" dir="ltr" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('admin.phone')">
        <input v-model="createForm.contactPhone" dir="ltr" class="neo-input" />
      </AppFormField>
      <AppFormField :label="t('admin.sport')">
        <select v-model="createForm.sport" class="neo-input">
          <option value="padel">padel</option>
          <option value="tennis">tennis</option>
        </select>
      </AppFormField>
      <p v-if="createError" class="venus-alert-error">{{ createError }}</p>
      <p v-if="createSuccess" class="venus-alert-success text-sm">{{ createSuccess }}</p>
      <button type="button" class="btn-secondary w-full" :disabled="creating" @click="createApplication">
        {{ creating ? t('common.loading') : t('admin.createApplicationSubmit') }}
      </button>
    </section>

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
              <td class="p-3 whitespace-nowrap">
                <div v-if="app.status === 'PENDING'" class="flex flex-wrap gap-2">
                  <button type="button" class="btn-primary text-xs" @click="openApprove(app)">
                    {{ t('admin.approve') }}
                  </button>
                  <button
                    type="button"
                    class="btn-secondary text-xs text-red-700"
                    :disabled="rejectingId === app.id"
                    @click="rejectApplication(app)"
                  >
                    {{ t('admin.reject') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppAsyncState>

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
          <p v-if="approveResult.clubSlug" class="text-xs" dir="ltr">/book/court/{{ approveResult.clubSlug }}</p>
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
