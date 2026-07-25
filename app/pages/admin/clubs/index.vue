<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { secret, clearSecret, adminFetch } = useAdminSecret()

type ClubRow = {
  id: string
  slug: string
  nameFa: string
  nameEn: string
  city: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  owner: { id: string; email: string; name: string; disabledAt: string | null } | null
  courtCount: number
  bookingCount: number
}

const clubs = ref<ClubRow[]>([])
const pending = ref(false)
const loadError = ref('')
const statusFilter = ref<'ALL' | 'PENDING' | 'ACTIVE' | 'SUSPENDED'>('ALL')
const search = ref('')
const updatingId = ref<string | null>(null)

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams()
    if (statusFilter.value !== 'ALL') params.set('status', statusFilter.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const qs = params.toString()
    const data = await adminFetch<{ clubs: ClubRow[] }>(`/api/admin/clubs${qs ? `?${qs}` : ''}`)
    clubs.value = data.clubs
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

async function setStatus(club: ClubRow, status: ClubRow['status']) {
  updatingId.value = club.id
  try {
    await adminFetch(`/api/admin/clubs/${club.id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    await load()
  } catch {
    loadError.value = t('common.error')
  } finally {
    updatingId.value = null
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch(statusFilter, () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.clubsTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.clubsSubtitle') }}</p>

    <div class="flex flex-wrap items-end gap-3">
      <AppFormField :label="t('common.name')" class="min-w-[12rem] flex-1">
        <input v-model="search" type="search" class="neo-input" :placeholder="t('admin.searchClubs')" @keyup.enter="load" />
      </AppFormField>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
        @click="load"
      >
        {{ t('admin.search') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED'] as const)"
        :key="option"
        type="button"
        class="border px-3 py-1.5 text-xs font-bold transition"
        style="border-radius: 2px;"
        :class="statusFilter === option
          ? 'border-brand-primary bg-brand-primary text-white'
          : 'border-brand-gray-200 bg-brand-gray-50 text-brand-navy hover:border-brand-primary/40'"
        @click="statusFilter = option"
      >
        {{ option === 'ALL' ? t('common.all') : t(`admin.clubStatus.${option.toLowerCase()}`) }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="clubs.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
        {{ t('common.empty') }}
      </div>
      <div v-else class="overflow-x-auto ios-card">
        <table class="w-full min-w-[760px] text-sm">
          <thead>
            <tr class="border-b border-brand-gray-100 text-start">
              <th class="p-3 font-bold">{{ t('admin.clubName') }}</th>
              <th class="p-3 font-bold">{{ t('admin.city') }}</th>
              <th class="p-3 font-bold">{{ t('admin.owner') }}</th>
              <th class="p-3 font-bold">{{ t('admin.status') }}</th>
              <th class="p-3 font-bold">{{ t('admin.metrics.bookings') }}</th>
              <th class="p-3 font-bold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="club in clubs" :key="club.id" class="border-b border-brand-gray-50">
              <td class="p-3">
                <NuxtLink :to="localePath(`/admin/clubs/${club.id}`)" class="font-bold text-brand-navy underline">
                  {{ localizedField(club, 'nameFa', 'nameEn') }}
                </NuxtLink>
                <div class="text-xs text-brand-gray-600" dir="ltr">{{ club.slug }}</div>
              </td>
              <td class="p-3">{{ club.city }}</td>
              <td class="p-3">
                <div v-if="club.owner">{{ club.owner.name }}</div>
                <div v-if="club.owner" class="text-xs text-brand-gray-600" dir="ltr">{{ club.owner.email }}</div>
                <div v-else class="text-brand-gray-500">—</div>
              </td>
              <td class="p-3">
                <span
                  class="px-2 py-0.5 text-xs font-bold"
                  style="border-radius: 2px;"
                  :class="{
                    'bg-green-100 text-green-800': club.status === 'ACTIVE',
                    'bg-amber-100 text-amber-800': club.status === 'PENDING',
                    'bg-red-100 text-red-800': club.status === 'SUSPENDED',
                  }"
                >
                  {{ t(`admin.clubStatus.${club.status.toLowerCase()}`) }}
                </span>
              </td>
              <td class="p-3 tabular-nums" dir="ltr">{{ club.bookingCount }}</td>
              <td class="p-3 whitespace-nowrap">
                <div class="flex flex-wrap gap-2">
                  <button
                    v-if="club.status !== 'ACTIVE'"
                    type="button"
                    class="bg-brand-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
                    style="border-radius: 2px;"
                    :disabled="updatingId === club.id"
                    @click="setStatus(club, 'ACTIVE')"
                  >
                    {{ t('admin.activate') }}
                  </button>
                  <button
                    v-if="club.status === 'ACTIVE'"
                    type="button"
                    class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="updatingId === club.id"
                    @click="setStatus(club, 'SUSPENDED')"
                  >
                    {{ t('admin.suspend') }}
                  </button>
                  <button
                    v-if="club.status === 'SUSPENDED'"
                    type="button"
                    class="border border-brand-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                    style="border-radius: 2px;"
                    :disabled="updatingId === club.id"
                    @click="setStatus(club, 'PENDING')"
                  >
                    {{ t('admin.markPending') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppAsyncState>
  </div>
</template>
