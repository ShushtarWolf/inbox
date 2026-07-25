<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatNumber } = useFormatters()

type Overview = {
  clubs: { total: number; active: number; pending: number; suspended: number }
  users: { total: number; athlete: number; coach: number; clubAdmin: number; disabled: number }
  bookings: { total: number; confirmed: number; cancelled: number; pending: number; today: number }
  payments: { count: number; totalAmount: number; paidCount: number; paidAmount: number; pendingCount: number }
  applications: { pending: number }
  email?: {
    emailConfigured: boolean
    emailMode: 'log' | 'live'
    emailEnabledFlag: boolean
    hasSmtpHost: boolean
    note: string
    warnings: string[]
  }
  storage?: {
    storageMode: 's3' | 'local'
    s3Configured: boolean
    hasEndpoint: boolean
    hasBucket: boolean
    hasPublicUrl: boolean
    bucket: string | null
    publicUrlHost: string | null
    note: string
    warnings: string[]
  }
}

type PilotClub = {
  id: string
  slug: string
  nameFa: string
  nameEn: string
  status: string
  courtCount: number
  openHour: number
  closeHour: number
  bookable: boolean
  ownerEmail: string | null
  ownerLastLoginAt: string | null
  checks: { id: string; ok: boolean }[]
}

const data = ref<Overview | null>(null)
const pilotClubs = ref<PilotClub[]>([])
const smsPhase = ref<'SINGLE' | 'MULTI' | null>(null)
const smsMultiReady = ref(false)
const pending = ref(false)
const loadError = ref('')

const consoleLinks = computed(() => [
  { to: localePath('/admin/clubs'), label: t('admin.nav.clubs') },
  { to: localePath('/admin/users'), label: t('admin.nav.users') },
  { to: localePath('/admin/bookings'), label: t('admin.nav.bookings') },
  { to: localePath('/admin/applications'), label: t('admin.nav.applications') },
  { to: localePath('/admin/sms'), label: t('admin.nav.sms') },
  { to: localePath('/admin/sentry'), label: t('admin.nav.sentry') },
  { to: localePath('/admin/provision'), label: t('admin.nav.provision') },
])

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const [overview, checklist, sms] = await Promise.all([
      adminFetch<Overview>('/api/admin/overview'),
      adminFetch<{ clubs: PilotClub[] }>('/api/admin/pilot-checklist'),
      adminFetch<{ smsPhase: 'SINGLE' | 'MULTI'; multiReady?: boolean }>('/api/admin/sms-status'),
    ])
    data.value = overview
    pilotClubs.value = checklist.clubs
    smsPhase.value = sms.smsPhase
    smsMultiReady.value = Boolean(sms.multiReady)
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

function checkLabel(id: string) {
  return t(`admin.pilotChecks.${id}`)
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <section class="canva-dash-hero">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs text-white/80">{{ t('admin.consoleTitle') }}</p>
          <h1 class="mt-1 text-2xl font-bold">{{ t('admin.overviewTitle') }}</h1>
          <p class="mt-1 text-sm text-white/85">{{ t('admin.overviewSubtitle') }}</p>
        </div>
        <button type="button" class="rounded-lg bg-white px-3 py-2 text-xs font-bold text-brand-primary" :disabled="pending" @click="load">
          {{ t('common.retry') }}
        </button>
      </div>
    </section>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="data" class="space-y-6">
        <div class="tail-card flex flex-wrap gap-2">
          <NuxtLink
            v-for="link in consoleLinks"
            :key="link.to"
            :to="link.to"
            class="border border-brand-gray-200 bg-brand-gray-50 px-3 py-1.5 text-xs font-bold text-brand-navy hover:border-brand-primary/40"
            style="border-radius: 2px;"
          >
            {{ link.label }}
          </NuxtLink>
        </div>

        <section
          v-if="smsPhase"
          class="tail-card space-y-2"
          :class="smsMultiReady ? 'border-emerald-200' : 'border-amber-200'"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="tail-section-title">{{ t('admin.nav.sms') }}</h2>
            <span
              class="px-2 py-1 text-xs font-bold"
              style="border-radius: 2px;"
              :class="smsMultiReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'"
            >
              {{ smsPhase }} · {{ smsMultiReady ? t('admin.smsPage.multiReadyYes') : t('admin.smsPage.multiReadyNo') }}
            </span>
          </div>
          <p class="text-sm text-brand-gray-600">
            {{ smsMultiReady ? t('admin.smsPage.phaseMultiBanner') : t('admin.smsPage.phaseSingleBanner') }}
          </p>
          <NuxtLink :to="localePath('/admin/sms')" class="inline-block text-sm font-bold text-brand-navy underline">
            {{ t('admin.viewAll') }}
          </NuxtLink>
        </section>

        <div class="tail-card-grid-4">
          <AppTailStatCard :label="t('admin.metrics.clubs')" :value="formatNumber(data.clubs.total)" icon="stadium" />
          <AppTailStatCard :label="t('admin.metrics.users')" :value="formatNumber(data.users.total)" icon="group" />
          <AppTailStatCard :label="t('admin.metrics.bookings')" :value="formatNumber(data.bookings.total)" icon="event" />
          <AppTailStatCard :label="t('admin.metrics.paidRevenue')" :value="formatCurrency(data.payments.paidAmount)" icon="payments" />
        </div>

        <section class="tail-card space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 class="tail-section-title">{{ t('admin.pilotChecklistTitle') }}</h2>
              <p class="mt-1 text-xs text-brand-gray-500">{{ t('admin.pilotChecklistSubtitle') }}</p>
            </div>
            <NuxtLink :to="localePath('/admin/provision')" class="text-xs font-bold text-brand-navy underline">
              {{ t('admin.nav.provision') }}
            </NuxtLink>
          </div>
          <div v-if="pilotClubs.length === 0" class="text-sm text-brand-gray-600">
            {{ t('admin.pilotChecklistEmpty') }}
          </div>
          <ul v-else class="space-y-3">
            <li v-for="club in pilotClubs" :key="club.id" class="rounded-lg border border-brand-gray-100 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <NuxtLink :to="localePath(`/admin/clubs/${club.id}`)" class="font-bold underline">
                    {{ club.nameFa }}
                  </NuxtLink>
                  <p class="text-xs text-brand-gray-500" dir="ltr">{{ club.slug }} · {{ club.ownerEmail || '—' }}</p>
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="club.bookable ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
                >
                  {{ club.bookable ? t('admin.pilotBookable') : t('admin.pilotNotBookable') }}
                </span>
              </div>
              <ul class="mt-2 grid gap-1 sm:grid-cols-2">
                <li
                  v-for="check in club.checks"
                  :key="check.id"
                  class="flex items-center gap-2 text-xs"
                  :class="check.ok ? 'text-green-700' : 'text-amber-700'"
                >
                  <span aria-hidden="true">{{ check.ok ? '✓' : '○' }}</span>
                  <span>{{ checkLabel(check.id) }}</span>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <div class="tail-card-grid-3">
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.nav.clubs') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.active') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.active) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.pending') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.pending) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.clubStatus.suspended') }}</span><strong dir="ltr">{{ formatNumber(data.clubs.suspended) }}</strong></li>
            </ul>
            <NuxtLink :to="localePath('/admin/clubs')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.viewAll') }}
            </NuxtLink>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.nav.users') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.CLUB_ADMIN') }}</span><strong dir="ltr">{{ formatNumber(data.users.clubAdmin) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.ATHLETE') }}</span><strong dir="ltr">{{ formatNumber(data.users.athlete) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.roles.COACH') }}</span><strong dir="ltr">{{ formatNumber(data.users.coach) }}</strong></li>
              <li class="flex justify-between gap-2"><span>{{ t('admin.userDisabled') }}</span><strong dir="ltr">{{ formatNumber(data.users.disabled) }}</strong></li>
            </ul>
            <NuxtLink :to="localePath('/admin/users')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.viewAll') }}
            </NuxtLink>
          </div>
          <div class="tail-card">
            <h2 class="tail-section-title mb-3">{{ t('admin.attention') }}</h2>
            <ul class="space-y-2 text-sm">
              <li class="flex justify-between gap-2">
                <NuxtLink :to="localePath('/admin/applications')" class="underline">{{ t('admin.metrics.pendingApplications') }}</NuxtLink>
                <strong dir="ltr">{{ formatNumber(data.applications.pending) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.metrics.bookingsToday') }}</span>
                <strong dir="ltr">{{ formatNumber(data.bookings.today) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.metrics.pendingPayments') }}</span>
                <strong dir="ltr">{{ formatNumber(data.payments.pendingCount) }}</strong>
              </li>
              <li>
                <NuxtLink :to="localePath('/admin/sms')" class="underline">{{ t('admin.nav.sms') }}</NuxtLink>
              </li>
            </ul>
            <NuxtLink :to="localePath('/admin/provision')" class="mt-4 inline-block text-sm font-bold text-brand-navy underline">
              {{ t('admin.nav.provision') }}
            </NuxtLink>
          </div>
        </div>

        <section v-if="data.email" class="tail-card space-y-2">
          <h2 class="tail-section-title">{{ t('admin.emailOpsTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ data.email.note }}</p>
          <ul class="space-y-1 text-sm">
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.emailMode') }}</span>
              <strong dir="ltr">{{ data.email.emailMode }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.emailConfigured') }}</span>
              <strong dir="ltr">{{ data.email.emailConfigured ? t('admin.smsPage.yes') : t('admin.smsPage.no') }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.emailHasSmtpHost') }}</span>
              <strong dir="ltr">{{ data.email.hasSmtpHost ? t('admin.smsPage.yes') : t('admin.smsPage.no') }}</strong>
            </li>
          </ul>
          <ul v-if="data.email.warnings.length" class="mt-2 space-y-1 text-xs text-amber-700">
            <li v-for="(w, i) in data.email.warnings" :key="i">{{ w }}</li>
          </ul>
        </section>

        <section v-if="data.storage" class="tail-card space-y-2">
          <h2 class="tail-section-title">{{ t('admin.storageOpsTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ data.storage.note }}</p>
          <ul class="space-y-1 text-sm">
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.storageMode') }}</span>
              <strong dir="ltr">{{ data.storage.storageMode }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.storageS3Configured') }}</span>
              <strong dir="ltr">{{ data.storage.s3Configured ? t('admin.smsPage.yes') : t('admin.smsPage.no') }}</strong>
            </li>
            <li v-if="data.storage.bucket" class="flex justify-between gap-2">
              <span>{{ t('admin.storageBucket') }}</span>
              <strong dir="ltr">{{ data.storage.bucket }}</strong>
            </li>
            <li v-if="data.storage.publicUrlHost" class="flex justify-between gap-2">
              <span>{{ t('admin.storagePublicHost') }}</span>
              <strong dir="ltr">{{ data.storage.publicUrlHost }}</strong>
            </li>
          </ul>
          <ul v-if="data.storage.warnings.length" class="mt-2 space-y-1 text-xs text-amber-700">
            <li v-for="(w, i) in data.storage.warnings" :key="i">{{ w }}</li>
          </ul>
        </section>
      </div>
    </AppAsyncState>
  </div>
</template>
