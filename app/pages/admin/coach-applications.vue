<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatDate, formatCurrency } = useFormatters()

type CoachStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type CoachApplication = {
  id: string
  nameFa: string
  nameEn: string
  city: string
  sessionPrice: number
  sportSlug: string
  status: CoachStatus
  approvalNote: string | null
  appliedAt: string | null
  reviewedAt: string | null
  userName: string | null
  userEmail: string | null
  userPhone: string | null
  clubName: string | null
}

const applications = ref<CoachApplication[]>([])
const pending = ref(false)
const loadError = ref('')
const statusFilter = ref<'ALL' | CoachStatus>('PENDING')

const actingId = ref<string | null>(null)
const rejectTarget = ref<CoachApplication | null>(null)
const rejectNote = ref('')
const rejectPending = ref(false)

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
    const data = await adminFetch<{ applications: CoachApplication[] }>(
      `/api/admin/coaches/applications${qs ? `?${qs}` : ''}`,
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

async function approve(app: CoachApplication) {
  if (actingId.value) return
  actingId.value = app.id
  loadError.value = ''
  try {
    await adminFetch(`/api/admin/coaches/${app.id}/approve`, { method: 'POST' })
    await loadApplications()
  } catch {
    loadError.value = t('common.error')
  } finally {
    actingId.value = null
  }
}

function requestReject(app: CoachApplication) {
  rejectTarget.value = app
  rejectNote.value = ''
}

function closeReject() {
  if (rejectPending.value) return
  rejectTarget.value = null
  rejectNote.value = ''
}

async function confirmReject() {
  if (!rejectTarget.value) return
  rejectPending.value = true
  try {
    await adminFetch(`/api/admin/coaches/${rejectTarget.value.id}/reject`, {
      method: 'POST',
      body: { note: rejectNote.value.trim() || undefined },
    })
    rejectTarget.value = null
    rejectNote.value = ''
    await loadApplications()
  } catch {
    loadError.value = t('common.error')
    rejectTarget.value = null
  } finally {
    rejectPending.value = false
  }
}

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
        <h1 class="tail-page-title">{{ t('admin.coachApplicationsTitle') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('admin.coachApplicationsSubtitle') }}</p>
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
        {{ t('admin.noCoachApplications') }}
      </div>
      <div
        v-else
        class="overflow-x-auto border border-brand-gray-200 bg-white"
        style="border-radius: 2px;"
      >
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-brand-gray-100 text-start">
              <th class="p-3 font-bold">{{ t('admin.coachName') }}</th>
              <th class="p-3 font-bold">{{ t('admin.city') }}</th>
              <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
              <th class="p-3 font-bold">{{ t('admin.coachSessionPrice') }}</th>
              <th class="p-3 font-bold">{{ t('admin.status') }}</th>
              <th class="p-3 font-bold">{{ t('admin.date') }}</th>
              <th class="p-3 font-bold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in applications" :key="app.id" class="border-b border-brand-gray-50">
              <td class="p-3">
                <div class="font-bold">{{ app.nameFa }}</div>
                <div v-if="app.clubName" class="text-xs text-brand-gray-600">{{ app.clubName }}</div>
              </td>
              <td class="p-3">{{ app.city }}</td>
              <td class="p-3">
                <div v-if="app.userName">{{ app.userName }}</div>
                <div v-if="app.userEmail" class="text-xs text-brand-gray-600" dir="ltr">{{ app.userEmail }}</div>
                <div v-if="app.userPhone" class="text-xs text-brand-gray-600" dir="ltr">{{ app.userPhone }}</div>
              </td>
              <td class="p-3 tabular-nums">{{ formatCurrency(app.sessionPrice) }}</td>
              <td class="p-3">
                <span
                  class="px-2 py-0.5 text-xs font-bold"
                  style="border-radius: 2px;"
                  :class="statusClass(app.status)"
                >
                  {{ statusLabel(app.status) }}
                </span>
                <div v-if="app.approvalNote" class="mt-1 text-[11px] text-brand-gray-500">{{ app.approvalNote }}</div>
              </td>
              <td class="p-3 tabular-nums" dir="ltr">{{ app.appliedAt ? formatDate(app.appliedAt) : '—' }}</td>
              <td class="p-3 whitespace-nowrap">
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="app.status !== 'APPROVED'"
                    type="button"
                    class="bg-brand-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="actingId === app.id"
                    @click="approve(app)"
                  >
                    {{ t('admin.approve') }}
                  </button>
                  <button
                    v-if="app.status !== 'REJECTED'"
                    type="button"
                    class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="actingId === app.id"
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

    <AppModal
      :open="!!rejectTarget"
      :title="t('admin.reject')"
      sheet
      patterned
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeReject"
    >
      <div class="canva-auth-body space-y-4 px-5 pb-6 pt-2">
        <p class="text-start text-sm font-bold text-brand-navy">{{ rejectTarget?.nameFa }}</p>
        <AppFormField :label="t('admin.rejectNote')">
          <input
            v-model="rejectNote"
            class="neo-input bg-white/95"
            style="border-radius: 2px;"
            :disabled="rejectPending"
          >
        </AppFormField>
        <button
          type="button"
          class="canva-gate-btn-primary"
          :disabled="rejectPending"
          @click="confirmReject"
        >
          {{ rejectPending ? t('common.loading') : t('admin.reject') }}
        </button>
        <button
          type="button"
          class="canva-gate-btn-secondary"
          :disabled="rejectPending"
          @click="closeReject"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
