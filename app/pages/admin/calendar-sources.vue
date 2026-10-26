<script setup lang="ts">
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

interface SourcesCalendarCourt {
  id: string
  nameFa: string
  nameEn: string
}

interface SourcesCalendarSlot {
  id: string
  courtId: string
  startTime: string
  endTime: string
  displayStatus: string
}

interface SourcesCalendarResponse {
  courts?: SourcesCalendarCourt[]
  slots?: SourcesCalendarSlot[]
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { localizedField } = useLocalizedField()
const { formatTimeLabel } = useFormatters()
const { today } = useLocalDate()
const { secret, clearSecret, adminFetch } = useAdminSecret()

const clubSlug = ref(typeof route.query.clubSlug === 'string' ? route.query.clubSlug : PILOT_CLUB_SLUG)
const date = ref(today())
const data = ref<SourcesCalendarResponse | null>(null)
const pending = ref(false)
const loadError = ref('')

const {
  externalOverlayEnabled,
  externalOverlayPending,
  externalOverlayError,
  externalData,
  externalCellFor,
  isExternalOnlyOccupied,
  isExternalUncertain,
  externalSiteBadge,
  refreshExternalOverlay,
} = useAdminExternalCalendarOverlay({ clubSlug, date, secret, adminFetch })

async function load() {
  if (!secret.value || !clubSlug.value.trim()) return
  pending.value = true
  loadError.value = ''
  try {
    data.value = await adminFetch<SourcesCalendarResponse>(
      `/api/admin/calendar?clubSlug=${encodeURIComponent(clubSlug.value.trim())}&date=${encodeURIComponent(date.value)}`,
    )
    void refreshExternalOverlay()
  } catch (err: unknown) {
    data.value = null
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

watch(secret, (value) => {
  if (value) void load()
}, { immediate: true })

watch([clubSlug, date], () => {
  if (secret.value) void load()
})

const courts = computed(() => data.value?.courts || [])

const timeRows = computed(() => {
  const starts = [...new Set((data.value?.slots || []).map((s) => s.startTime.slice(0, 5)))]
  return starts.sort()
})

function slotFor(courtId: string, startTime: string) {
  return (data.value?.slots || []).find(
    (s) => s.courtId === courtId && s.startTime.slice(0, 5) === startTime,
  ) || null
}

function cellKind(courtId: string, startTime: string): 'inbox-busy' | 'external' | 'uncertain' | 'free' | 'empty' {
  const slot = slotFor(courtId, startTime)
  if (!slot) return 'empty'
  if (slot.displayStatus !== 'FREE') return 'inbox-busy'
  if (isExternalOnlyOccupied(slot)) return 'external'
  if (isExternalUncertain(slot)) return 'uncertain'
  return 'free'
}

function cellBadge(courtId: string, startTime: string) {
  const slot = slotFor(courtId, startTime)
  return slot ? externalSiteBadge(slot) : ''
}

function cellSources(courtId: string, startTime: string) {
  const slot = slotFor(courtId, startTime)
  if (!slot) return ''
  return (externalCellFor(slot)?.sourceDetails || [])
    .filter((d) => d.source !== 'inbox')
    .map((d) => d.externalClubTitle ? `${d.siteLabel}: ${d.externalClubTitle}` : d.siteLabel)
    .join(' · ')
}
</script>

<template>
  <div class="tail-page-stack pb-24">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink :to="localePath('/admin/clubs')" class="text-sm font-bold text-brand-navy underline">
        {{ t('admin.backToClubs') }}
      </NuxtLink>
      <NuxtLink
        :to="localePath({ path: '/admin/calendar', query: { clubSlug: clubSlug.trim() } })"
        class="text-xs font-bold text-brand-primary underline"
      >
        {{ t('admin.calendarLink') }}
      </NuxtLink>
    </div>

    <h1 class="tail-page-title">{{ t('admin.calendarSourcesTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.calendarSourcesNote') }}</p>
    <p class="text-xs font-bold text-brand-gray-500">{{ t('admin.calendarSourcesAutoRefresh') }}</p>

    <div class="venus-form-stack">
      <label for="admin-sources-club-slug" class="block text-sm font-bold text-brand-navy">
        <span>clubSlug</span>
        <input id="admin-sources-club-slug" v-model="clubSlug" dir="ltr" class="neo-input mt-1 block min-w-[12rem]">
      </label>
      <AppDateInput v-model="date" :label="t('common.date')" />
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="canva-gate-btn-secondary" :disabled="pending" @click="load">
          {{ pending ? t('common.loading') : t('common.refresh') }}
        </button>
      </div>
    </div>

    <p v-if="loadError" class="text-sm text-red-700">{{ loadError }}</p>

    <template v-else>
      <div
        v-if="externalOverlayEnabled && (externalOverlayPending || externalOverlayError)"
        class="ios-card p-3 text-sm"
        :class="externalOverlayError ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'"
        role="status"
      >
        <p class="font-bold">{{ externalOverlayError || t('admin.calendarOverlayLoading') }}</p>
        <button
          v-if="externalOverlayError"
          type="button"
          class="mt-2 text-xs font-bold underline"
          :disabled="externalOverlayPending"
          @click="refreshExternalOverlay()"
        >
          {{ t('admin.calendarOverlayRetry') }}
        </button>
      </div>
      <p v-else-if="externalOverlayEnabled && externalData && !externalData.mapped" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
        {{ t('admin.calendarSourcesNotMapped') }}
      </p>

      <p class="text-xs text-brand-gray-600">{{ t('admin.calendarExternalLegend') }}</p>

      <AppVenusSpinner v-if="pending && !data" size="sm" :label="t('common.loading')" compact />
      <p v-else-if="data && !timeRows.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
        {{ t('coach.book.noSlots') }}
      </p>
      <div v-else-if="data" class="overflow-x-auto">
        <table class="coach-dash-table min-w-[36rem]">
          <thead>
            <tr>
              <th>{{ t('coach.dashboardColTime') }}</th>
              <th v-for="court in courts" :key="court.id">{{ localizedField(court, 'nameFa', 'nameEn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="start in timeRows" :key="start">
              <td dir="ltr" class="tabular-nums">{{ formatTimeLabel(start) }}</td>
              <td
                v-for="court in courts"
                :key="court.id"
                :class="{
                  'bg-brand-primary/5 font-bold text-brand-navy': cellKind(court.id, start) === 'inbox-busy',
                  'bg-brand-gray-50 text-brand-gray-600': cellKind(court.id, start) === 'external',
                  'bg-amber-50 text-amber-900': cellKind(court.id, start) === 'uncertain',
                }"
              >
                <template v-if="cellKind(court.id, start) === 'inbox-busy'">{{ t('admin.calendarSourcesInboxBusy') }}</template>
                <template v-else-if="cellKind(court.id, start) === 'external'">
                  {{ cellBadge(court.id, start) }}
                  <span v-if="cellSources(court.id, start)" class="block text-[10px]">{{ cellSources(court.id, start) }}</span>
                </template>
                <template v-else-if="cellKind(court.id, start) === 'uncertain'">{{ cellBadge(court.id, start) }}</template>
                <template v-else-if="cellKind(court.id, start) === 'free'">{{ t('admin.calendarSourcesInboxFree') }}</template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
