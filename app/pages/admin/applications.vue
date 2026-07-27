<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatDate } = useFormatters()

type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type Application = {
  id: string
  clubName: string
  city: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  sportSlug: string
  status: ApplicationStatus
  createdAt: string
  clubId: string | null
  clubSlug: string | null
}

const applications = ref<Application[]>([])
const pending = ref(false)
const loadError = ref('')
const statusFilter = ref<'ALL' | ApplicationStatus>('ALL')

const approveTarget = ref<Application | null>(null)
const ownerEmail = ref('')
const approving = ref(false)
const approveError = ref('')
const approveResult = ref<{ temporaryPassword?: string; ownerEmail?: string; clubSlug?: string } | null>(null)

const rejectingId = ref<string | null>(null)
const rejectTarget = ref<Application | null>(null)
const rejectPending = ref(false)

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

const chipBase = 'border px-3 py-1.5 text-xs font-bold transition'
const chipActive = 'border-brand-primary bg-brand-primary text-white'
const chipIdle = 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'

function statusLabel(status: string) {
  const key = `admin.applicationStatus.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800'
  if (status === 'REJECTED') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-900'
}

async function loadApplications() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams()
    if (statusFilter.value !== 'ALL') params.set('status', statusFilter.value)
    const qs = params.toString()
    const data = await adminFetch<{ applications: Application[] }>(
      `/api/admin/clubs/applications${qs ? `?${qs}` : ''}`,
    )
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
    statusFilter.value = 'PENDING'
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
  if (approving.value) return
  approveTarget.value = null
  ownerEmail.value = ''
  approveError.value = ''
  approveResult.value = null
}

async function confirmApprove() {
  if (!approveTarget.value || !ownerEmail.value.trim()) {
    approveError.value = t('common.required')
    return
  }
  approving.value = true
  approveError.value = ''
  try {
    const result = await adminFetch<{ temporaryPassword?: string; ownerEmail: string; clubSlug?: string }>(
      `/api/admin/clubs/${approveTarget.value.id}/approve`,
      { method: 'POST', body: { ownerEmail: ownerEmail.value.trim() } },
    )
    approveResult.value = result
    await loadApplications()
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    approveError.value = status === 409 ? t('admin.approveConflict') : t('common.error')
  } finally {
    approving.value = false
  }
}

async function requestReject(app: Application) {
  rejectTarget.value = app
}

function closeReject() {
  if (rejectPending.value) return
  rejectTarget.value = null
}

async function confirmReject() {
  if (!rejectTarget.value) return
  rejectPending.value = true
  rejectingId.value = rejectTarget.value.id
  try {
    await adminFetch(`/api/admin/clubs/${rejectTarget.value.id}/reject`, { method: 'POST' })
    rejectTarget.value = null
    await loadApplications()
  } catch {
    loadError.value = t('common.error')
    rejectTarget.value = null
  } finally {
    rejectPending.value = false
    rejectingId.value = null
  }
}

const rejectBody = computed(() => {
  if (!rejectTarget.value) return t('admin.rejectConfirm')
  return t('admin.rejectConfirmNamed', { name: rejectTarget.value.clubName })
})

watch(secret, (value) => {
  if (value) loadApplications()
}, { immediate: true })

watch(statusFilter, () => {
  if (secret.value) loadApplications()
})
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.applicationsTitle') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('admin.applicationsSubtitle') }}</p>
      </div>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
        style="border-radius: 2px;"
        :disabled="pending"
        @click="loadApplications"
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <section
      class="mx-auto max-w-lg border border-brand-gray-200 bg-white p-4 venus-form-stack"
      style="border-radius: 2px;"
    >
      <h2 class="font-bold text-brand-navy">{{ t('admin.createApplicationTitle') }}</h2>
      <p class="text-xs text-brand-gray-500">{{ t('admin.createApplicationHint') }}</p>
      <AppFormField :label="t('admin.clubName')">
        <input v-model="createForm.clubName" class="neo-input" style="border-radius: 2px;" />
      </AppFormField>
      <AppFormField :label="t('admin.city')">
        <input v-model="createForm.city" class="neo-input" style="border-radius: 2px;" />
      </AppFormField>
      <AppFormField :label="t('common.name')">
        <input v-model="createForm.contactName" class="neo-input" style="border-radius: 2px;" />
      </AppFormField>
      <AppFormField :label="t('admin.ownerEmail')">
        <input v-model="createForm.contactEmail" type="email" dir="ltr" class="neo-input" style="border-radius: 2px;" />
      </AppFormField>
      <AppFormField :label="t('admin.phone')">
        <input v-model="createForm.contactPhone" dir="ltr" class="neo-input" style="border-radius: 2px;" />
      </AppFormField>
      <AppFormField :label="t('admin.sport')">
        <select v-model="createForm.sport" class="neo-input" style="border-radius: 2px;">
          <option value="padel">{{ t('clubs.sportPadel') }}</option>
          <option value="tennis">{{ t('clubs.sportTennis') }}</option>
        </select>
      </AppFormField>
      <p v-if="createError" class="venus-alert-error text-start">{{ createError }}</p>
      <p v-if="createSuccess" class="venus-alert-success text-start text-sm">{{ createSuccess }}</p>
      <button
        type="button"
        class="w-full border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
        style="border-radius: 2px;"
        :disabled="creating"
        @click="createApplication"
      >
        {{ creating ? t('common.loading') : t('admin.createApplicationSubmit') }}
      </button>
    </section>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const)"
        :key="option"
        type="button"
        :class="[chipBase, statusFilter === option ? chipActive : chipIdle]"
        style="border-radius: 2px;"
        @click="statusFilter = option"
      >
        {{ option === 'ALL' ? t('common.all') : statusLabel(option) }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div
        v-if="applications.length === 0"
        class="border border-brand-gray-200 bg-white p-6 text-center text-sm text-brand-gray-600"
        style="border-radius: 2px;"
      >
        {{ t('admin.noApplications') }}
      </div>
      <div
        v-else
        class="overflow-x-auto border border-brand-gray-200 bg-white"
        style="border-radius: 2px;"
      >
        <table class="w-full min-w-[720px] text-sm">
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
                <div class="text-xs text-brand-gray-600" dir="ltr">{{ app.contactEmail }}</div>
                <div v-if="app.contactPhone" class="text-xs text-brand-gray-600" dir="ltr">{{ app.contactPhone }}</div>
              </td>
              <td class="p-3" dir="ltr">{{ app.sportSlug }}</td>
              <td class="p-3">
                <span
                  class="px-2 py-0.5 text-xs font-bold"
                  style="border-radius: 2px;"
                  :class="statusClass(app.status)"
                >
                  {{ statusLabel(app.status) }}
                </span>
              </td>
              <td class="p-3 tabular-nums" dir="ltr">{{ formatDate(app.createdAt) }}</td>
              <td class="p-3 whitespace-nowrap">
                <div v-if="app.status === 'PENDING'" class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="bg-brand-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                    style="border-radius: 2px;"
                    @click="openApprove(app)"
                  >
                    {{ t('admin.approve') }}
                  </button>
                  <button
                    type="button"
                    class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="rejectingId === app.id"
                    @click="requestReject(app)"
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

    <!-- Approve modal: Canva sheet sibling + square ops CTAs -->
    <AppModal
      :open="!!approveTarget"
      :title="t('admin.approveTitle')"
      sheet
      patterned
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeApprove"
    >
      <div class="canva-auth-body space-y-4 px-5 pb-6 pt-2">
        <p class="text-start text-sm font-bold text-brand-navy">{{ approveTarget?.clubName }}</p>
        <p class="text-start text-xs text-brand-gray-600">{{ approveTarget?.city }} · {{ approveTarget?.sportSlug }}</p>

        <template v-if="!approveResult">
          <AppFormField :label="t('admin.ownerEmail')">
            <input
              v-model="ownerEmail"
              type="email"
              dir="ltr"
              class="neo-input bg-white/95"
              style="border-radius: 2px;"
              autocomplete="email"
              :disabled="approving"
            />
          </AppFormField>
          <p v-if="approveError" class="venus-alert-error text-start" role="alert">{{ approveError }}</p>
          <button
            type="button"
            class="canva-gate-btn-primary"
            :disabled="approving"
            @click="confirmApprove"
          >
            {{ approving ? t('common.loading') : t('admin.approve') }}
          </button>
          <button
            type="button"
            class="canva-gate-btn-secondary"
            :disabled="approving"
            @click="closeApprove"
          >
            {{ t('common.close') }}
          </button>
        </template>

        <template v-else>
          <div class="venus-alert-success text-start text-sm">
            <p class="font-bold">{{ t('admin.approveSuccess') }}</p>
            <p v-if="approveResult.temporaryPassword" class="mt-2" dir="ltr">
              {{ t('admin.tempPassword') }}: <strong>{{ approveResult.temporaryPassword }}</strong>
            </p>
            <p v-if="approveResult.ownerEmail" class="mt-1 text-xs" dir="ltr">{{ approveResult.ownerEmail }}</p>
            <p v-if="approveResult.clubSlug" class="mt-1 text-xs" dir="ltr">/clubs/{{ approveResult.clubSlug }}</p>
          </div>
          <button type="button" class="canva-gate-btn-primary" @click="closeApprove">
            {{ t('common.close') }}
          </button>
        </template>
      </div>
    </AppModal>

    <CanvaConfirmSheet
      :open="Boolean(rejectTarget)"
      :title="t('admin.reject')"
      :body="rejectBody"
      :confirm-label="t('admin.reject')"
      :dismiss-label="t('common.close')"
      :pending="rejectPending"
      danger
      @confirm="confirmReject"
      @close="closeReject"
    />
  </div>
</template>
