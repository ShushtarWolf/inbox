<script setup lang="ts">
import { IRAN_WEEKDAY_ORDER, type DayTimeRange } from '#shared/recurringSessions.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatIsoDate, formatNumber } = useFormatters()
const { packagesEnabled } = usePilotFlags()

interface PackageRow {
  id: string
  title: string
  status: string
  capacity: number
  price: number
  discount: number
  level: number | null
  startDate: string | null
  finishDate: string | null
  coachId: string | null
  courtId: string | null
  coach?: { id: string; nameFa: string; nameEn: string } | null
  court?: { id: string; nameFa: string; nameEn: string } | null
  _count?: { bookings: number; players: number }
}

interface CourtRow {
  id: string
  nameFa: string
  nameEn: string
}

interface CoachRow {
  id: string
  nameFa: string
  nameEn: string
}

interface ConflictRow {
  kind: string
  date: string
  startTime: string
  label?: string
}

const { data, pending, error, refresh } = await useAuthedFetch<PackageRow[]>('/api/owner/packages', {
  immediate: packagesEnabled.value,
})
const { data: courtsData } = await useAuthedFetch<CourtRow[]>('/api/owner/courts')
useOwnerClubRefresh(refresh)

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
  level: null as number | null,
  courtId: '',
  coachId: '' as string,
  startDate: '',
  finishDate: '',
  days: [] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  comment: '',
})

const preview = ref<{
  sessions: Array<{ date: string; startTime: string; endTime: string }>
  sessionCount: number
  conflicts: ConflictRow[]
} | null>(null)

const courts = computed(() => courtsData.value || [])
/** Coaches are independent — owner packages do not attach a club-affiliated coach. */
const coaches = computed(() => [] as CoachRow[])
const packages = computed(() => data.value || [])
const hasConflicts = computed(() => (preview.value?.conflicts.length || 0) > 0)
const canSubmitConfirm = computed(() =>
  Boolean(preview.value && preview.value.sessionCount > 0 && !hasConflicts.value && !saving.value),
)

function courtLabel(court: CourtRow) {
  return locale.value === 'fa' ? court.nameFa : court.nameEn
}

function coachLabel(coach: CoachRow) {
  return locale.value === 'fa' ? coach.nameFa : coach.nameEn
}

function statusLabel(status: string) {
  return t(`owner.packagesPage.status.${status}`, status)
}

function conflictLabel(c: ConflictRow) {
  const when = `${formatIsoDate(c.date)} ${c.startTime}`
  if (c.kind === 'court_slot') return t('owner.packagesPage.conflictCourt', { when, label: c.label || '' })
  if (c.kind === 'package_court') return t('owner.packagesPage.conflictPackageCourt', { when, label: c.label || '' })
  if (c.kind === 'package_coach') return t('owner.packagesPage.conflictPackageCoach', { when, label: c.label || '' })
  if (c.kind === 'coach_session') return t('owner.packagesPage.conflictCoachSession', { when })
  return when
}

function resetForm() {
  form.title = ''
  form.capacity = 8
  form.price = 0
  form.discount = 0
  form.level = null
  form.courtId = courts.value[0]?.id || ''
  form.coachId = ''
  form.startDate = ''
  form.finishDate = ''
  form.days = []
  form.dayTimes = {}
  form.comment = ''
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
  } else {
    form.days = [...form.days, day]
    form.dayTimes = {
      ...form.dayTimes,
      [day]: form.dayTimes[day] || { start: '16:00', end: '17:00' },
    }
  }
}

async function runPreview() {
  formError.value = ''
  if (!form.courtId || !form.startDate || !form.finishDate || !form.days.length) {
    formError.value = t('owner.packagesPage.errorIncomplete')
    return
  }
  if (form.finishDate < form.startDate) {
    formError.value = t('owner.packagesPage.dateRangeInvalid')
    return
  }
  previewing.value = true
  try {
    preview.value = await $fetch('/api/owner/packages/conflicts', {
      method: 'POST',
      body: {
        courtId: form.courtId,
        coachId: form.coachId || null,
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
  if (!canSubmitConfirm.value) return
  saving.value = true
  confirmError.value = ''
  try {
    await $fetch('/api/owner/packages', {
      method: 'POST',
      body: {
        title: form.title,
        capacity: form.capacity,
        price: form.price,
        discount: form.discount,
        level: form.level,
        courtId: form.courtId,
        coachId: form.coachId || null,
        startDate: form.startDate,
        finishDate: form.finishDate,
        days: form.days,
        dayTimes: form.dayTimes,
        comment: form.comment || undefined,
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
    await $fetch(`/api/owner/packages/${id}/cancel`, { method: 'POST' })
    await refresh()
  }
  catch (err: unknown) {
    formError.value = fetchErrorMessage(err, t('owner.packagesPage.errorCancel'))
  }
}

const selectedCourt = computed(() => courts.value.find((c) => c.id === form.courtId))
const selectedCoach = computed(() => coaches.value.find((c) => c.id === form.coachId))
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.packages')" />

    <template v-if="!packagesEnabled">
      <p class="text-sm text-brand-gray-600">{{ t('owner.packagesDisabled.body') }}</p>
      <NuxtLink
        :to="localePath('/owner/calendar')"
        class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
        style="border-radius: var(--sz-canva-radius);"
      >
        {{ t('owner.packagesDisabled.cta') }}
      </NuxtLink>
    </template>

    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-brand-gray-600">{{ t('owner.packagesPage.subtitle') }}</p>
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
                  {{ statusLabel(pkg.status) }}
                  · {{ formatCurrency(Math.max(0, pkg.price - (pkg.discount || 0))) }}
                  · {{ t('owner.packagesPage.seatsUsed', {
                    used: (pkg._count?.bookings || 0) + (pkg._count?.players || 0),
                    capacity: pkg.capacity,
                  }) }}
                </p>
                <p v-if="pkg.startDate && pkg.finishDate" class="text-xs text-brand-gray-600">
                  {{ formatIsoDate(pkg.startDate) }} — {{ formatIsoDate(pkg.finishDate) }}
                </p>
                <p v-if="pkg.court" class="text-xs text-brand-gray-600">{{ courtLabel(pkg.court) }}</p>
                <p v-if="pkg.coach" class="text-xs text-brand-gray-600">{{ coachLabel(pkg.coach) }}</p>
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
            <option v-for="court in courts" :key="court.id" :value="court.id">{{ courtLabel(court) }}</option>
          </select>
        </AppFormField>
        <AppFormField v-if="!pilotNoCoach" :label="t('owner.packagePage.coachPlaceholder')">
          <select v-model="form.coachId" class="canva-input w-full">
            <option value="">{{ t('owner.packagesPage.coachPlaceholder') }}</option>
            <option v-for="coach in coaches" :key="coach.id" :value="coach.id">{{ coachLabel(coach) }}</option>
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
        <AppFormField :label="t('owner.packagesPage.discount')" numeric>
          <input v-model.number="form.discount" type="number" min="0" class="canva-input w-full" >
        </AppFormField>
        <div class="grid grid-cols-2 gap-2">
          <AppFormField :label="t('owner.packagesPage.startDate')">
            <input v-model="form.startDate" type="date" class="canva-input w-full" >
          </AppFormField>
          <AppFormField :label="t('owner.packagesPage.finishDate')">
            <input v-model="form.finishDate" type="date" class="canva-input w-full" >
          </AppFormField>
        </div>
        <div>
          <p class="mb-1 text-xs font-bold text-brand-navy">{{ t('owner.packagesPage.weekdays') }}</p>
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
        </div>
        <div v-for="day in form.days" :key="day" class="grid grid-cols-2 gap-2">
          <AppFormField :label="`${t(`owner.weekdays.${day}`)} — ${t('owner.seasonPage.startTime')}`">
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
          :aria-busy="previewing"
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
        <ul class="space-y-1 text-sm text-brand-gray-700">
          <li v-if="selectedCourt">{{ t('owner.packagesPage.court') }}: {{ courtLabel(selectedCourt) }}</li>
          <li v-if="selectedCoach">{{ t('owner.packagePage.coachPlaceholder') }}: {{ coachLabel(selectedCoach) }}</li>
          <li>{{ t('owner.packagesPage.capacity') }}: {{ formatNumber(form.capacity) }}</li>
          <li>{{ t('owner.packagesPage.price') }}: {{ formatCurrency(Math.max(0, form.price - form.discount)) }}</li>
          <li v-if="form.startDate && form.finishDate">
            {{ formatIsoDate(form.startDate) }} — {{ formatIsoDate(form.finishDate) }}
          </li>
          <li>{{ t('owner.packagesPage.sessionCount', { count: preview?.sessionCount || 0 }) }}</li>
        </ul>

        <div v-if="preview?.sessions?.length" class="max-h-40 overflow-y-auto rounded border border-brand-gray-200 p-2 text-xs">
          <p
            v-for="(session, idx) in preview.sessions.slice(0, 40)"
            :key="`${session.date}-${session.startTime}-${idx}`"
          >
            {{ formatIsoDate(session.date) }} · {{ session.startTime }}–{{ session.endTime }}
          </p>
          <p v-if="preview.sessions.length > 40" class="text-brand-gray-600">
            {{ t('owner.packagesPage.moreSessions', { count: preview.sessions.length - 40 }) }}
          </p>
        </div>

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
          :aria-busy="saving"
          @click="confirmPublish"
        >
          {{ saving ? t('owner.packagesPage.publishing') : t('owner.packagesPage.publish') }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
