<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { localizedField } = useLocalizedField()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatNumber } = useFormatters()

type ClubDetail = {
  id: string
  slug: string
  nameFa: string
  nameEn: string
  city: string
  district: string | null
  addressFa: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  phone: string | null
  openHour: number
  closeHour: number
  priceFrom: number
  priceTo: number | null
  owner: { id: string; email: string; name: string; phone: string | null; disabledAt: string | null } | null
  courts: { id: string; nameFa: string; nameEn: string; sport: { slug: string; nameFa: string } }[]
  staff: { role: string; user: { id: string; email: string; name: string } }[]
  courtCount: number
  mediaCount: number
  bookingCount: number
}

const club = ref<ClubDetail | null>(null)
const pending = ref(false)
const loadError = ref('')
const updating = ref(false)

async function load() {
  if (!secret.value) return
  const id = String(route.params.id || '')
  if (!id) return
  pending.value = true
  loadError.value = ''
  try {
    club.value = await adminFetch<ClubDetail>(`/api/admin/clubs/${id}`)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else if (status === 404) {
      loadError.value = t('admin.clubNotFound')
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

async function setStatus(status: ClubDetail['status']) {
  if (!club.value) return
  updating.value = true
  try {
    await adminFetch(`/api/admin/clubs/${club.value.id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    await load()
  } catch {
    loadError.value = t('common.error')
  } finally {
    updating.value = false
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch(() => route.params.id, () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink :to="localePath('/admin/clubs')" class="text-sm font-bold text-brand-navy underline">
        {{ t('admin.backToClubs') }}
      </NuxtLink>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="club" class="space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="tail-page-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</h1>
            <p class="mt-1 text-sm text-brand-gray-600" dir="ltr">{{ club.slug }}</p>
            <p class="mt-1 text-sm text-brand-gray-600">{{ club.city }}{{ club.district ? ` · ${club.district}` : '' }}</p>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-bold"
            :class="{
              'bg-green-100 text-green-800': club.status === 'ACTIVE',
              'bg-amber-100 text-amber-800': club.status === 'PENDING',
              'bg-red-100 text-red-800': club.status === 'SUSPENDED',
            }"
          >
            {{ t(`admin.clubStatus.${club.status.toLowerCase()}`) }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-if="club.status !== 'ACTIVE'"
            type="button"
            class="btn-primary text-xs"
            :disabled="updating"
            @click="setStatus('ACTIVE')"
          >
            {{ t('admin.activate') }}
          </button>
          <button
            v-if="club.status === 'ACTIVE'"
            type="button"
            class="btn-secondary text-xs text-red-700"
            :disabled="updating"
            @click="setStatus('SUSPENDED')"
          >
            {{ t('admin.suspend') }}
          </button>
          <button
            v-if="club.status === 'SUSPENDED'"
            type="button"
            class="btn-secondary text-xs"
            :disabled="updating"
            @click="setStatus('PENDING')"
          >
            {{ t('admin.markPending') }}
          </button>
        </div>

        <div class="tail-card-grid-3">
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.clubDetails') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.address') }}</span><span class="text-end">{{ club.addressFa }}</span></li>
              <li v-if="club.phone" class="flex justify-between gap-2"><span>{{ t('admin.phone') }}</span><span dir="ltr">{{ club.phone }}</span></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.hours') }}</span><span dir="ltr">{{ club.openHour }}–{{ club.closeHour }}</span></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.priceFrom') }}</span><span dir="ltr">{{ formatCurrency(club.priceFrom) }}</span></li>
            </ul>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.owner') }}</h2>
            <template v-if="club.owner">
              <p class="font-bold">{{ club.owner.name }}</p>
              <p class="text-sm text-brand-gray-600" dir="ltr">{{ club.owner.email }}</p>
              <p v-if="club.owner.phone" class="text-sm text-brand-gray-600" dir="ltr">{{ club.owner.phone }}</p>
              <p v-if="club.owner.disabledAt" class="mt-2 text-xs font-bold text-red-700">{{ t('admin.userDisabled') }}</p>
            </template>
            <p v-else class="text-sm text-brand-gray-500">—</p>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.metrics.bookings') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.metrics.bookings') }}</span><strong dir="ltr">{{ formatNumber(club.bookingCount) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.courts') }}</span><strong dir="ltr">{{ formatNumber(club.courtCount) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.media') }}</span><strong dir="ltr">{{ formatNumber(club.mediaCount) }}</strong></li>
            </ul>
          </div>
        </div>

        <div class="tail-card">
          <h2 class="tail-section-title mb-3">{{ t('admin.courts') }}</h2>
          <ul v-if="club.courts.length" class="divide-y divide-brand-gray-50 text-sm">
            <li v-for="court in club.courts" :key="court.id" class="flex justify-between gap-2 py-2">
              <span>{{ localizedField(court, 'nameFa', 'nameEn') }}</span>
              <span class="text-brand-gray-600">{{ court.sport.nameFa }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-brand-gray-500">{{ t('common.empty') }}</p>
        </div>

        <div class="tail-card">
          <h2 class="tail-section-title mb-3">{{ t('admin.staff') }}</h2>
          <ul v-if="club.staff.length" class="divide-y divide-brand-gray-50 text-sm">
            <li v-for="member in club.staff" :key="member.user.id" class="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span class="font-bold">{{ member.user.name }}</span>
                <span class="ms-2 text-brand-gray-600" dir="ltr">{{ member.user.email }}</span>
              </span>
              <span class="text-brand-gray-600">{{ member.role }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-brand-gray-500">{{ t('common.empty') }}</p>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
