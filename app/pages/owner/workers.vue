<script setup lang="ts">
import {
  ALL_OWNER_PERMISSIONS,
  defaultPermissionsForRole,
  parsePermissions,
  type OwnerPermission,
} from '#shared/ownerPermissions.ts'
import type { DayTimeRange } from '#shared/recurringSessions.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/workers')
useOwnerClubRefresh(refresh)
const { formatTimeRange } = useFormatters()

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface WorkerItem {
  id: string
  firstName: string
  lastName: string
  mobile: string
  emergencyMobile: string | null
  email: string | null
  role: string
  workingHours: Record<string, DayTimeRange>
  permissionsJson: string | null
  hasLogin: boolean
}

const showModal = ref(false)
const editing = ref<WorkerItem | null>(null)
const saving = ref(false)
const modalError = ref('')
const credentialResult = ref('')

const form = reactive({
  firstName: '',
  lastName: '',
  mobile: '',
  emergencyMobile: '',
  email: '',
  role: 'FRONT_DESK',
  selectedDays: [] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  permissions: [] as OwnerPermission[],
})

function staffRoleLabel(role: string) {
  const key = `owner.roles.${role}` as const
  const translated = t(key)
  return translated === key ? role : translated
}

function permissionLabel(permission: OwnerPermission) {
  return t(`owner.permissions.${permission}`)
}

function resetForm() {
  form.firstName = ''
  form.lastName = ''
  form.mobile = ''
  form.emergencyMobile = ''
  form.email = ''
  form.role = 'FRONT_DESK'
  form.selectedDays = []
  form.dayTimes = {}
  form.permissions = [...defaultPermissionsForRole('FRONT_DESK')]
}

function openAdd() {
  editing.value = null
  resetForm()
  modalError.value = ''
  credentialResult.value = ''
  showModal.value = true
}

function openEdit(worker: WorkerItem) {
  editing.value = worker
  form.firstName = worker.firstName
  form.lastName = worker.lastName
  form.mobile = worker.mobile
  form.emergencyMobile = worker.emergencyMobile || ''
  form.email = worker.email || ''
  form.role = worker.role
  form.selectedDays = Object.keys(worker.workingHours)
  form.dayTimes = { ...worker.workingHours }
  form.permissions = parsePermissions(worker.permissionsJson) as OwnerPermission[]
  modalError.value = ''
  credentialResult.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editing.value = null
  modalError.value = ''
}

watch(() => form.role, (role) => {
  if (!editing.value) {
    form.permissions = [...defaultPermissionsForRole(role)]
  }
})

function toggleDay(day: string) {
  if (form.selectedDays.includes(day)) {
    form.selectedDays = form.selectedDays.filter((item) => item !== day)
    const next = { ...form.dayTimes }
    delete next[day]
    form.dayTimes = next
  } else {
    form.selectedDays = [...form.selectedDays, day]
    form.dayTimes = {
      ...form.dayTimes,
      [day]: form.dayTimes[day] || { start: '08:00', end: '17:00' },
    }
  }
}

function togglePermission(permission: OwnerPermission) {
  if (form.permissions.includes(permission)) {
    form.permissions = form.permissions.filter((item) => item !== permission)
  } else {
    form.permissions = [...form.permissions, permission]
  }
}

function workingHoursSummary(worker: WorkerItem) {
  const entries = Object.entries(worker.workingHours)
  if (!entries.length) return t('owner.workersPage.noSchedule')
  return entries
    .map(([day, range]) => `${t(`owner.weekdays.${day}`)} ${formatTimeRange(range.start)}–${formatTimeRange(range.end)}`)
    .join(' · ')
}

async function saveWorker() {
  if (!form.firstName.trim() || !form.lastName.trim() || !form.mobile.trim()) return
  saving.value = true
  modalError.value = ''
  credentialResult.value = ''
  try {
    const workingHours: Record<string, DayTimeRange> = {}
    for (const day of form.selectedDays) {
      if (form.dayTimes[day]) workingHours[day] = form.dayTimes[day]
    }
    const body = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      mobile: form.mobile.trim(),
      emergencyMobile: form.emergencyMobile.trim() || null,
      email: form.email.trim() || null,
      role: form.role,
      permissions: form.permissions,
      workingHours,
    }
    const res = await $fetch<{ temporaryPassword?: string }>(
      editing.value ? `/api/owner/workers/${editing.value.id}` : '/api/owner/workers',
      { method: editing.value ? 'PATCH' : 'POST', body },
    )
    if (res.temporaryPassword) {
      credentialResult.value = t('owner.inviteCreated', { password: res.temporaryPassword })
    } else {
      closeModal()
    }
    await refresh()
  } catch {
    modalError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function deactivateWorker(worker: WorkerItem) {
  if (!confirm(t('owner.workersPage.confirmDelete'))) return
  try {
    await $fetch(`/api/owner/workers/${worker.id}`, { method: 'DELETE' })
    await refresh()
  } catch {
    // silent
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-xl font-bold">{{ t('owner.workers') }}</h1>
      <button type="button" class="btn-primary text-sm" @click="openAdd">{{ t('owner.workersPage.addWorker') }}</button>
    </div>
    <p class="text-sm text-brand-gray-600">{{ t('owner.workersPage.subtitle') }}</p>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <ul class="space-y-3">
        <li v-for="worker in data || []" :key="worker.id" class="ios-card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-bold">{{ worker.firstName }} {{ worker.lastName }}</p>
              <p class="mt-1 text-xs text-brand-gray-600">
                <span class="rounded-full bg-brand-cream px-2 py-0.5 font-semibold">{{ staffRoleLabel(worker.role) }}</span>
                <span v-if="worker.hasLogin" class="ms-2 rounded-full bg-brand-lavender/60 px-2 py-0.5 font-semibold">{{ t('owner.workersPage.hasLogin') }}</span>
              </p>
              <p class="mt-2 text-sm">
                <bdi dir="ltr" class="tabular-nums">{{ worker.mobile }}</bdi>
                <span v-if="worker.emergencyMobile" class="ms-2 text-brand-gray-600">
                  · {{ t('owner.workersPage.emergency') }}: <bdi dir="ltr" class="tabular-nums">{{ worker.emergencyMobile }}</bdi>
                </span>
              </p>
              <p v-if="worker.email" class="mt-1 text-xs text-brand-gray-600"><bdi dir="ltr">{{ worker.email }}</bdi></p>
              <p class="mt-2 text-xs text-brand-gray-600">{{ workingHoursSummary(worker) }}</p>
              <p v-if="worker.permissionsJson" class="mt-1 text-[11px] text-brand-gray-500">
                {{ parsePermissions(worker.permissionsJson).map((p) => permissionLabel(p as OwnerPermission)).join(' · ') }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button type="button" class="text-xs text-brand-gray-600" @click="openEdit(worker)">{{ t('common.edit') }}</button>
              <button type="button" class="text-xs text-red-600" @click="deactivateWorker(worker)">{{ t('owner.deactivate') }}</button>
            </div>
          </div>
        </li>
        <li v-if="!(data || []).length" class="ios-card p-4 text-sm text-brand-gray-600">{{ t('common.empty') }}</li>
      </ul>
    </AppAsyncState>

    <AppModal
      :open="showModal"
      :title="editing ? t('owner.workersPage.editTitle') : t('owner.workersPage.addTitle')"
      @close="closeModal"
    >
      <div class="venus-modal-shell venus-modal-shell-simple">
        <div class="venus-modal-panel">
          <div class="venus-modal-panel-body venus-form-stack max-h-[70vh] overflow-y-auto">
            <div class="grid gap-3 sm:grid-cols-2">
              <AppFormField :label="t('owner.workersPage.firstName')" required>
                <input v-model="form.firstName" class="neo-input" autocomplete="given-name">
              </AppFormField>
              <AppFormField :label="t('owner.workersPage.lastName')" required>
                <input v-model="form.lastName" class="neo-input" autocomplete="family-name">
              </AppFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <AppFormField :label="t('owner.workersPage.mobile')" required>
                <input v-model="form.mobile" type="tel" dir="ltr" class="neo-input tabular-nums" autocomplete="tel">
              </AppFormField>
              <AppFormField :label="t('owner.workersPage.emergencyMobile')">
                <input v-model="form.emergencyMobile" type="tel" dir="ltr" class="neo-input tabular-nums">
              </AppFormField>
            </div>
            <AppFormField :label="t('owner.workersPage.emailHint')">
              <input v-model="form.email" type="email" dir="ltr" class="neo-input" autocomplete="email">
            </AppFormField>
            <AppFormField :label="t('owner.settingsPage.role')">
              <select v-model="form.role" class="neo-select">
                <option value="MANAGER">{{ t('owner.roles.MANAGER') }}</option>
                <option value="FRONT_DESK">{{ t('owner.roles.FRONT_DESK') }}</option>
                <option value="ANALYST">{{ t('owner.roles.ANALYST') }}</option>
              </select>
            </AppFormField>

            <div>
              <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.workersPage.workingHours') }}</p>
              <div class="mb-3 flex flex-wrap gap-2">
                <button
                  v-for="day in weekdayOptions"
                  :key="day"
                  type="button"
                  class="neo-pill text-xs"
                  :class="form.selectedDays.includes(day) ? 'neo-pill-active' : 'neo-pill-inactive'"
                  @click="toggleDay(day)"
                >
                  {{ t(`owner.weekdays.${day}`) }}
                </button>
              </div>
              <OwnerDayTimeSchedules
                v-if="form.selectedDays.length"
                v-model:day-times="form.dayTimes"
                :days="form.selectedDays"
              />
            </div>

            <div class="ios-card bg-brand-lavender/40 p-3">
              <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.permissionsTitle') }}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="permission in ALL_OWNER_PERMISSIONS" :key="permission" class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    :checked="form.permissions.includes(permission)"
                    @change="togglePermission(permission)"
                  >
                  <span>{{ permissionLabel(permission) }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="venus-modal-footer">
            <p v-if="credentialResult" class="text-sm text-brand-gray-600">{{ credentialResult }}</p>
            <p v-if="modalError" class="venus-alert-error">{{ modalError }}</p>
            <div class="flex gap-3">
              <button
                type="button"
                class="btn-primary flex-1"
                :disabled="saving || !form.firstName.trim() || !form.lastName.trim() || !form.mobile.trim()"
                @click="saveWorker"
              >
                {{ saving ? t('common.loading') : t('common.save') }}
              </button>
              <button type="button" class="btn-ghost flex-1" @click="closeModal">{{ t('common.close') }}</button>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>
