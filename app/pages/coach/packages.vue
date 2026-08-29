<script setup lang="ts">
import { IRAN_WEEKDAY_ORDER, type DayTimeRange } from '#shared/recurringSessions.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t, locale } = useI18n()
const { formatCurrency, formatIsoDate, formatNumber } = useFormatters()
const { packagesEnabled } = usePilotFlags()

interface CourtRow {
  id: string
  nameFa: string
  nameEn: string
}

interface PackageRow {
  id: string
  title: string
  status: string
  capacity: number
  price: number
  discount: number
  startDate: string | null
  finishDate: string | null
  court?: CourtRow | null
  _count?: { bookings: number; players: number }
}

interface ConflictRow {
  kind: string
  date: string
  startTime: string
  label?: string
}

const { data: metaData } = await useAuthedFetch<{
  links: Array<{
    status: string
    club: { id: string; nameFa: string; nameEn: string }
    courts?: CourtRow[]
  }>
}>('/api/coach/packages/meta', {
  immediate: packagesEnabled.value,
})

const clubId = ref('')
const courts = computed(() => {
  const link = (metaData.value?.links || []).find((l) => l.club.id === clubId.value)
  return link?.courts || []
})

watchEffect(() => {
  const active = (metaData.value?.links || [])[0]
  if (!clubId.value && active) clubId.value = active.club.id
})

const { data, pending, error, refresh } = await useAuthedFetch<PackageRow[]>(
  () => (clubId.value ? `/api/coach/packages?clubId=${encodeURIComponent(clubId.value)}` : ''),
  { immediate: false, watch: [clubId] },
)

watch(clubId, () => {
  if (packagesEnabled.value && clubId.value) refresh()
})

const packages = computed(() => data.value || [])
const activeClubs = computed(() => metaData.value?.links || [])

const showForm = ref(false)
const showConfirm = ref(false)
const saving = ref(false)
const previewing = ref(false)
const formError = ref('')
const confirmError = ref('')

const form = reactive({
  title: '',
  capacity: 8,
  price: 0,
  discount: 0,
  courtId: '',
  startDate: '',
  finishDate: '',
  days: [] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
})

const preview = ref<{
  sessions: Array<{ date: string; startTime: string; endTime: string }>
  sessionCount: number
  conflicts: ConflictRow[]
} | null>(null)

const hasConflicts = computed(() => (preview.value?.conflicts.length || 0) > 0)
const canSubmitConfirm = computed(() =>
  Boolean(preview.value && preview.value.sessionCount > 0 && !hasConflicts.value && !saving.value),
)

function labelClub(club: { nameFa: string; nameEn: string }) {
  return locale.value === 'fa' ? club.nameFa : club.nameEn
}

function labelCourt(court: CourtRow) {
  return locale.value === 'fa' ? court.nameFa : court.nameEn
}

function resetForm() {
  form.title = ''
  form.capacity = 8
  form.price = 0
  form.discount = 0
  form.courtId = courts.value[0]?.id || ''
  form.startDate = ''
  form.finishDate = ''
  form.days = []
  form.dayTimes = {}
  formError.value = ''
  confirmError.value = ''
  preview.value = null
}

function openCreate() {
  resetForm()
  showForm.value = true
}

function closeForm() {
  if (saving.value || previewing.value) return
  showForm.value = false
  showConfirm.value = false
}

function closeConfirm() {
  if (saving.value) return
  showConfirm.value = false
}

function toggleDay(day: string) {
  if (form.days.includes(day)) {
    form.days = form.days.filter((d) => d !== day)
    const next = { ...form.dayTimes }
    delete next[day]
    form.dayTimes = next
  }
  else {
    form.days = [...form.days, day]
    form.dayTimes = {
      ...form.dayTimes,
      [day]: form.dayTimes[day] || { start: '16:00', end: '17:00' },
    }
  }
}

async function runPreview() {
  formError.value = ''
  if (!clubId.value || !form.courtId || !form.startDate || !form.finishDate || !form.days.length) {
    formError.value = t('owner.packagesPage.errorIncomplete')
    return
  }
  previewing.value = true
  try {
    preview.value = await $fetch('/api/coach/packages/conflicts', {
      method: 'POST',
      body: {
        clubId: clubId.value,
        courtId: form.courtId,
        startDate: form.startDate,
        finishDate: form.finishDate,
        days: form.days,
        dayTimes: form.dayTimes,
      },
    })
    showConfirm.value = true
  }
  catch (err: unknown) {
    formError.value = fetchErrorMessage(err, t('owner.packagesPage.errorPreview'))
  }
  finally {
    previewing.value = false
  }
}

async function confirmPublish() {
  if (!canSubmitConfirm.value || !clubId.value) return
  saving.value = true
  confirmError.value = ''
  try {
    await $fetch('/api/coach/packages', {
      method: 'POST',
      body: {
        clubId: clubId.value,
        title: form.title,
        capacity: form.capacity,
        price: form.price,
        discount: form.discount,
        courtId: form.courtId,
        startDate: form.startDate,
        finishDate: form.finishDate,
        days: form.days,
        dayTimes: form.dayTimes,
        publish: true,
      },
    })
    showConfirm.value = false
    showForm.value = false
    await refresh()
  }
  catch (err: unknown) {
    confirmError.value = fetchErrorMessage(err, t('owner.packagesPage.errorPublish'))
  }
  finally {
    saving.value = false
  }
}

async function cancelPackage(id: string) {
  try {
    await $fetch(`/api/coach/packages/${id}/cancel`, { method: 'POST' })
    await refresh()
  }
  catch (err: unknown) {
    formError.value = fetchErrorMessage(err, t('owner.packagesPage.errorCancel'))
  }
}

function conflictLabel(c: ConflictRow) {
  const when = `${formatIsoDate(c.date)} ${c.startTime}`
  if (c.kind === 'court_slot') return t('owner.packagesPage.conflictCourt', { when, label: c.label || '' })
  if (c.kind === 'package_court') return t('owner.packagesPage.conflictPackageCourt', { when, label: c.label || '' })
  if (c.kind === 'package_coach') return t('owner.packagesPage.conflictPackageCoach', { when, label: c.label || '' })
  if (c.kind === 'coach_session') return t('owner.packagesPage.conflictCoachSession', { when })
  return when
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4">
    <h1 class="text-lg font-bold text-brand-navy">{{ t('owner.packages') }}</h1>

    <template v-if="!packagesEnabled">
      <p class="text-sm text-brand-gray-600">{{ t('owner.packagesDisabled.body') }}</p>
    </template>

    <template v-else>
      <AppFormField :label="t('coach.primaryClub')">
        <select v-model="clubId" class="canva-input w-full">
          <option v-for="link in activeClubs" :key="link.club.id" :value="link.club.id">
            {{ labelClub(link.club) }}
          </option>
        </select>
      </AppFormField>

      <div class="flex justify-end">
        <button
          type="button"
          class="canva-cta px-3 py-2 text-sm font-bold"
          style="border-radius: var(--sz-canva-radius);"
          @click="openCreate"
        >
          {{ t('owner.packagesPage.addLink') }}
        </button>
      </div>

      <p v-if="formError && !showForm" class="text-sm text-brand-error">{{ formError }}</p>

      <AppAsyncState :pending="pending" :error="error" :empty="!packages.length" @retry="refresh">
        <div class="space-y-3">
          <article
            v-for="pkg in packages"
            :key="pkg.id"
            class="rounded border border-brand-gray-200 bg-white p-3"
            style="border-radius: var(--sz-canva-radius);"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 text-start">
                <p class="font-bold text-brand-navy">{{ pkg.title }}</p>
                <p class="text-xs text-brand-gray-600">
                  {{ t(`owner.packagesPage.status.${pkg.status}`, pkg.status) }}
                  · {{ formatCurrency(Math.max(0, pkg.price - (pkg.discount || 0))) }}
                  · {{ t('owner.packagesPage.seatsUsed', {
                    used: (pkg._count?.bookings || 0) + (pkg._count?.players || 0),
                    capacity: pkg.capacity,
                  }) }}
                </p>
              </div>
              <button
                v-if="pkg.status !== 'CANCELLED'"
                type="button"
                class="text-xs font-bold text-brand-error"
                @click="cancelPackage(pkg.id)"
              >
                {{ t('owner.packagesPage.cancel') }}
              </button>
            </div>
          </article>
        </div>
        <template #empty>
          <p class="text-sm text-brand-gray-600">{{ t('owner.packagesPage.empty') }}</p>
        </template>
      </AppAsyncState>
    </template>

    <AppModal
      :open="showForm"
      patterned
      sheet
      :title="t('owner.packagesPage.createTitle')"
      max-width-class="canva-phone-shell"
      @close="closeForm"
    >
      <div class="space-y-3 px-1 pb-2 text-start">
        <AppFormField :label="t('owner.packagesPage.title')">
          <input v-model="form.title" type="text" class="canva-input w-full" >
        </AppFormField>
        <AppFormField :label="t('owner.packagesPage.court')">
          <select v-model="form.courtId" class="canva-input w-full">
            <option disabled value="">{{ t('owner.packagesPage.courtPlaceholder') }}</option>
            <option v-for="court in courts" :key="court.id" :value="court.id">{{ labelCourt(court) }}</option>
          </select>
        </AppFormField>
        <div class="grid grid-cols-2 gap-2">
          <AppFormField :label="t('owner.packagesPage.capacity')" numeric>
            <input v-model.number="form.capacity" type="number" min="1" class="canva-input w-full" >
          </AppFormField>
          <AppFormField :label="t('owner.packagesPage.price')" numeric>
            <input v-model.number="form.price" type="number" min="0" class="canva-input w-full" >
          </AppFormField>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <AppFormField :label="t('owner.packagesPage.startDate')">
            <input v-model="form.startDate" type="date" class="canva-input w-full" >
          </AppFormField>
          <AppFormField :label="t('owner.packagesPage.finishDate')">
            <input v-model="form.finishDate" type="date" class="canva-input w-full" >
          </AppFormField>
        </div>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="day in IRAN_WEEKDAY_ORDER"
            :key="day"
            type="button"
            class="px-2 py-1 text-xs font-bold"
            style="border-radius: var(--sz-canva-radius);"
            :class="form.days.includes(day) ? 'bg-brand-primary text-white' : 'bg-brand-gray-100 text-brand-navy'"
            @click="toggleDay(day)"
          >
            {{ t(`owner.weekdaysShort.${day}`) }}
          </button>
        </div>
        <div v-for="day in form.days" :key="day" class="grid grid-cols-2 gap-2">
          <AppFormField :label="t('owner.seasonPage.startTime')">
            <input v-model="form.dayTimes[day].start" type="time" class="canva-input w-full" >
          </AppFormField>
          <AppFormField :label="t('owner.seasonPage.endTime')">
            <input v-model="form.dayTimes[day].end" type="time" class="canva-input w-full" >
          </AppFormField>
        </div>
        <p v-if="formError" class="text-sm text-brand-error">{{ formError }}</p>
        <button
          type="button"
          class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
          style="border-radius: var(--sz-canva-radius);"
          :disabled="previewing"
          @click="runPreview"
        >
          {{ previewing ? t('owner.packagesPage.previewing') : t('owner.packagesPage.previewConfirm') }}
        </button>
      </div>
    </AppModal>

    <AppModal
      :open="showConfirm"
      patterned
      sheet
      :title="t('owner.packagesPage.confirmTitle')"
      max-width-class="canva-phone-shell"
      @close="closeConfirm"
    >
      <div class="space-y-3 px-1 pb-2 text-start">
        <p class="font-bold text-brand-navy">{{ form.title || t('owner.packagesPage.createTitle') }}</p>
        <p class="text-sm">{{ t('owner.packagesPage.sessionCount', { count: preview?.sessionCount || 0 }) }}</p>
        <p class="text-sm">{{ t('owner.packagesPage.capacity') }}: {{ formatNumber(form.capacity) }}</p>
        <div v-if="hasConflicts" class="rounded border border-brand-error/40 bg-red-50 p-2 text-sm text-brand-error">
          <p class="font-bold">{{ t('owner.packagesPage.conflictsTitle') }}</p>
          <p v-for="(c, i) in preview?.conflicts || []" :key="i">{{ conflictLabel(c) }}</p>
        </div>
        <p v-else class="text-sm text-brand-success">{{ t('owner.packagesPage.noConflicts') }}</p>
        <p class="text-xs text-brand-gray-600">{{ t('owner.packagesPage.payPolicy') }}</p>
        <p v-if="confirmError" class="text-sm text-brand-error">{{ confirmError }}</p>
        <button
          type="button"
          class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold disabled:opacity-50"
          style="border-radius: var(--sz-canva-radius);"
          :disabled="!canSubmitConfirm"
          @click="confirmPublish"
        >
          {{ saving ? t('owner.packagesPage.publishing') : t('owner.packagesPage.publish') }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
