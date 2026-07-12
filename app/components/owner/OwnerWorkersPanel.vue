<script setup lang="ts">
import {
  WORKER_ACCESS_AREAS,
  WORKER_POSITIONS,
  parseAccessAreas,
  type WorkerAccessArea,
  type WorkerPosition,
} from '#shared/workerAccess.ts'
import type { DayTimeRange } from '#shared/recurringSessions.ts'

const props = withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false,
})

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
  position: WorkerPosition
  workingHours: Record<string, DayTimeRange>
  accessAreasJson: string | null
}

const showModal = ref(false)
const editing = ref<WorkerItem | null>(null)
const saving = ref(false)
const modalError = ref('')

const form = reactive({
  firstName: '',
  lastName: '',
  mobile: '',
  emergencyMobile: '',
  position: 'RECEPTION' as WorkerPosition,
  selectedDays: [] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  accessAreas: [] as WorkerAccessArea[],
})

function positionLabel(position: WorkerPosition) {
  return t(`owner.workerPositions.${position}`)
}

function accessAreaLabel(area: WorkerAccessArea) {
  return t(`owner.workerAccess.${area}`)
}

function resetForm() {
  form.firstName = ''
  form.lastName = ''
  form.mobile = ''
  form.emergencyMobile = ''
  form.position = 'RECEPTION'
  form.selectedDays = []
  form.dayTimes = {}
  form.accessAreas = []
}

function openAdd() {
  editing.value = null
  resetForm()
  modalError.value = ''
  showModal.value = true
}

function openEdit(worker: WorkerItem) {
  editing.value = worker
  form.firstName = worker.firstName
  form.lastName = worker.lastName
  form.mobile = worker.mobile
  form.emergencyMobile = worker.emergencyMobile || ''
  form.position = worker.position
  form.selectedDays = Object.keys(worker.workingHours)
  form.dayTimes = { ...worker.workingHours }
  form.accessAreas = parseAccessAreas(worker.accessAreasJson)
  modalError.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editing.value = null
  modalError.value = ''
}

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

function toggleAccessArea(area: WorkerAccessArea) {
  if (form.accessAreas.includes(area)) {
    form.accessAreas = form.accessAreas.filter((item) => item !== area)
  } else {
    form.accessAreas = [...form.accessAreas, area]
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
      position: form.position,
      accessAreas: form.accessAreas,
      workingHours,
    }
    await $fetch(
      editing.value ? `/api/owner/workers/${editing.value.id}` : '/api/owner/workers',
      { method: editing.value ? 'PATCH' : 'POST', body },
    )
    closeModal()
    await refresh()
  } catch {
    modalError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function removeWorker(worker: WorkerItem) {
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
  <div :class="embedded ? '' : 'venus-page-stack'">
    <div v-if="!embedded" class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-xl font-bold">{{ t('owner.workers') }}</h1>
      <button type="button" class="btn-primary text-sm" @click="openAdd">{{ t('owner.workersPage.addWorker') }}</button>
    </div>
    <p v-if="!embedded" class="text-sm text-brand-gray-600">{{ t('owner.workersPage.subtitle') }}</p>
    <p v-if="!embedded" class="text-xs text-brand-gray-500">{{ t('owner.workersPage.coachesNote') }}</p>

    <div v-if="embedded" class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-brand-gray-600">{{ t('owner.settingsPage.workersSectionHint') }}</p>
      <button type="button" class="btn-primary text-sm" @click="openAdd">{{ t('owner.workersPage.addWorker') }}</button>
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <ul class="space-y-3">
        <li v-for="worker in data || []" :key="worker.id" class="ios-card p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-bold">{{ worker.firstName }} {{ worker.lastName }}</p>
              <p class="mt-1 text-xs text-brand-gray-600">
                <span class="rounded-full bg-brand-cream px-2 py-0.5 font-semibold">{{ positionLabel(worker.position) }}</span>
              </p>
              <p class="mt-2 text-sm">
                <bdi dir="ltr" class="tabular-nums">{{ worker.mobile }}</bdi>
                <span v-if="worker.emergencyMobile" class="ms-2 text-brand-gray-600">
                  · {{ t('owner.workersPage.emergency') }}: <bdi dir="ltr" class="tabular-nums">{{ worker.emergencyMobile }}</bdi>
                </span>
              </p>
              <p class="mt-2 text-xs text-brand-gray-600">{{ workingHoursSummary(worker) }}</p>
              <p v-if="worker.accessAreasJson" class="mt-1 text-[11px] text-brand-gray-500">
                {{ parseAccessAreas(worker.accessAreasJson).map((area) => accessAreaLabel(area)).join(' · ') }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button type="button" class="text-xs text-brand-gray-600" @click="openEdit(worker)">{{ t('common.edit') }}</button>
              <button type="button" class="text-xs text-red-600" @click="removeWorker(worker)">{{ t('common.delete') }}</button>
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
            <AppFormField :label="t('owner.workersPage.position')">
              <select v-model="form.position" class="neo-select">
                <option v-for="position in WORKER_POSITIONS" :key="position" :value="position">
                  {{ positionLabel(position) }}
                </option>
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
              <p class="mb-1 text-xs font-bold text-brand-gray-600">{{ t('owner.workersPage.accessAreas') }}</p>
              <p class="mb-2 text-[11px] text-brand-gray-500">{{ t('owner.workersPage.accessAreasHint') }}</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="area in WORKER_ACCESS_AREAS" :key="area" class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    :checked="form.accessAreas.includes(area)"
                    @change="toggleAccessArea(area)"
                  >
                  <span>{{ accessAreaLabel(area) }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="venus-modal-footer">
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
