<script setup lang="ts">
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'
import ExtCalSourcesGrid from '../../components/ExtCalSourcesGrid.vue'
import type { CalendarSourcesPayload } from '../../components/ExtCalSourcesGrid.vue'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { today } = useLocalDate()

const initialClubSlug = typeof route.query.clubSlug === 'string' ? route.query.clubSlug : PILOT_CLUB_SLUG
const clubSlug = ref(initialClubSlug)
const date = ref(today())
const data = ref<CalendarSourcesPayload | null>(null)
const pending = ref(false)
const loadError = ref('')
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

async function load() {
  if (!secret.value || !clubSlug.value.trim()) return
  pending.value = true
  loadError.value = ''
  try {
    data.value = await adminFetch<CalendarSourcesPayload>(
      `/api/admin/calendar-sources?clubSlug=${encodeURIComponent(clubSlug.value.trim())}&date=${encodeURIComponent(date.value)}`,
    )
    restartPolling()
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

function restartPolling() {
  if (pollTimer.value) clearInterval(pollTimer.value)
  const interval = data.value?.pollIntervalMs || 25_000
  pollTimer.value = setInterval(() => load(), interval)
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch([clubSlug, date], () => {
  if (secret.value) load()
})

onBeforeUnmount(() => {
  if (pollTimer.value) clearInterval(pollTimer.value)
})
</script>

<template>
  <div class="tail-page-stack pb-24">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink :to="localePath('/admin/clubs')" class="text-sm font-bold text-brand-navy underline">
        {{ t('admin.backToClubs') }}
      </NuxtLink>
    </div>

    <h1 class="tail-page-title">منابع تقویم (ادمین)</h1>

    <div class="flex flex-wrap items-end gap-3">
      <label class="block text-sm font-bold text-brand-navy">
        <span>clubSlug</span>
        <input id="admin-calendar-sources-club-slug" v-model="clubSlug" dir="ltr" class="neo-input mt-1 block min-w-[12rem]">
      </label>
      <button type="button" class="canva-gate-btn-secondary" :disabled="pending" @click="load">
        {{ pending ? t('common.loading') : 'بارگذاری' }}
      </button>
    </div>

    <ExtCalSourcesGrid
      :data="data"
      :pending="pending"
      :error="loadError || null"
      :date="date"
      show-club-slug
      @update:date="date = $event"
      @refresh="load()"
    />
  </div>
</template>
