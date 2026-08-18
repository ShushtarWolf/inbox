<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t, te } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatNumber } = useFormatters()

type SmsStatus = {
  ok: boolean
  smsPhase: 'SINGLE' | 'MULTI'
  multiReady?: boolean
  multiReadyChecks?: {
    liveProvider: boolean
    smsEnabled: boolean
    hasApiKey: boolean
    hasTemplateOrSender: boolean
  }
  resolvedProvider: 'log' | 'live'
  smsMode: 'log' | 'live'
  smsEnabledFlag: boolean
  isSmsEnabled: boolean
  hasKavenegarApiKey: boolean
  hasKavenegarTemplate: boolean
  hasKavenegarSender: boolean
  /** Leftover obsolete bypass env — ignored by auth; ops should unset. */
  hasOtpBypassConfigured?: boolean
  pendingScheduled: number
  dueNow: number
  warningCodes?: string[]
  nextActionCodes?: string[]
  warnings: string[]
  nextActions?: string[]
  noteCode?: 'multi' | 'single_partial' | 'single_log'
  note: string
}

type ProcessResult = {
  ok: boolean
  processed: number
  failed: number
  pending: number
  provider: 'log' | 'live'
  note: string
  errors?: string[]
}

type DailyOwnerResult = {
  ok: boolean
  date: string
  provider: 'log' | 'live'
  clubsWithReservations: number
  sent: number
  skippedNoPhone: number
  skippedAlreadySent: number
  failed: number
  note: string
  errors?: string[]
}

const status = ref<SmsStatus | null>(null)
const pending = ref(false)
const processing = ref(false)
const processingDaily = ref(false)
const loadError = ref('')
const processResult = ref<ProcessResult | null>(null)
const processError = ref('')
const dailyResult = ref<DailyOwnerResult | null>(null)
const dailyError = ref('')

/** MULTI banner only when snapshot says truly ready (same gate as FLOW-G). */
const showMultiBanner = computed(() => Boolean(status.value?.multiReady && status.value?.smsPhase === 'MULTI'))

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    status.value = await adminFetch<SmsStatus>('/api/admin/sms-status')
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode
    if (code === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

async function processScheduled() {
  if (!secret.value || processing.value) return
  processing.value = true
  processError.value = ''
  processResult.value = null
  try {
    processResult.value = await adminFetch<ProcessResult>('/api/admin/sms/process-scheduled', {
      method: 'POST',
    })
    await load()
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode
    if (code === 403) {
      processError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      processError.value = t('common.error')
    }
  } finally {
    processing.value = false
  }
}

async function processDailyOwner() {
  if (!secret.value || processingDaily.value) return
  processingDaily.value = true
  dailyError.value = ''
  dailyResult.value = null
  try {
    dailyResult.value = await adminFetch<DailyOwnerResult>('/api/admin/sms/process-daily-owner-reminders', {
      method: 'POST',
    })
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode
    if (code === 403) {
      dailyError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      dailyError.value = t('common.error')
    }
  } finally {
    processingDaily.value = false
  }
}

function yesNo(value: boolean) {
  return value ? t('admin.smsPage.yes') : t('admin.smsPage.no')
}

function translateCode(group: 'warningCodes' | 'nextActionCodes', code: string, fallback?: string) {
  const key = `admin.smsPage.${group}.${code}`
  if (te(key)) return t(key)
  return fallback || code
}

function noteLabel(s: SmsStatus) {
  if (s.noteCode === 'multi' || s.multiReady) return t('admin.smsPage.noteMulti')
  if (s.noteCode === 'single_partial' || s.resolvedProvider === 'live') return t('admin.smsPage.noteSinglePartial')
  return t('admin.smsPage.noteSingleLog')
}

const warningItems = computed(() => {
  const s = status.value
  if (!s) return []
  if (s.warningCodes?.length) {
    return s.warningCodes.map((code, idx) => translateCode('warningCodes', code, s.warnings[idx]))
  }
  return s.warnings || []
})

const nextActionItems = computed(() => {
  const s = status.value
  if (!s) return []
  if (s.nextActionCodes?.length) {
    return s.nextActionCodes.map((code, idx) => translateCode('nextActionCodes', code, s.nextActions?.[idx]))
  }
  return s.nextActions || []
})

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="tail-page-title">{{ t('admin.smsTitle') }}</h1>
        <p class="mt-1 text-sm text-brand-gray-600">{{ t('admin.smsSubtitle') }}</p>
      </div>
      <button
        type="button"
        class="border border-brand-gray-300 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40 disabled:opacity-60"
        style="border-radius: 2px;"
        :disabled="pending"
        @click="load"
      >
        {{ t('common.retry') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="status" class="space-y-6">
        <!-- PHASE banner: MULTI only when multiReady; else SINGLE (no global-delivery claim) -->
        <div
          class="border p-3 text-sm font-bold"
          style="border-radius: 2px;"
          :class="showMultiBanner
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'"
        >
          <span class="me-2 inline-block px-2 py-0.5 text-xs" style="border-radius: 2px;" :class="showMultiBanner ? 'bg-emerald-100' : 'bg-amber-100'">
            {{ status.smsPhase }}
          </span>
          {{ showMultiBanner ? t('admin.smsPage.phaseMultiBanner') : t('admin.smsPage.phaseSingleBanner') }}
        </div>

        <section class="tail-card space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="tail-section-title">{{ t('admin.smsPage.multiReadyTitle') }}</h2>
            <span
              class="px-2 py-1 text-xs font-bold"
              style="border-radius: 2px;"
              :class="status.multiReady
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-900'"
            >
              {{ status.multiReady ? t('admin.smsPage.multiReadyYes') : t('admin.smsPage.multiReadyNo') }}
            </span>
          </div>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.checkLiveProvider') }}</span>
              <strong dir="ltr">{{ yesNo(status.multiReadyChecks?.liveProvider ?? status.resolvedProvider === 'live') }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.checkSmsEnabled') }}</span>
              <strong dir="ltr">{{ yesNo(status.multiReadyChecks?.smsEnabled ?? status.smsEnabledFlag) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.checkApiKey') }}</span>
              <strong dir="ltr">{{ yesNo(status.multiReadyChecks?.hasApiKey ?? status.hasKavenegarApiKey) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.checkTemplateOrSender') }}</span>
              <strong dir="ltr">{{ yesNo(status.multiReadyChecks?.hasTemplateOrSender ?? (status.hasKavenegarTemplate || status.hasKavenegarSender)) }}</strong>
            </li>
          </ul>
        </section>

        <div class="tail-card-grid-4">
          <AppTailStatCard
            :label="t('admin.smsPage.smsPhase')"
            :value="status.smsPhase"
            icon="sms"
          />
          <AppTailStatCard
            :label="t('admin.smsPage.resolvedProvider')"
            :value="status.resolvedProvider"
            icon="sms"
          />
          <AppTailStatCard
            :label="t('admin.smsPage.enabled')"
            :value="yesNo(status.smsEnabledFlag)"
            icon="toggle_on"
          />
          <AppTailStatCard
            :label="t('admin.smsPage.dueNow')"
            :value="formatNumber(status.dueNow)"
            icon="schedule"
          />
        </div>

        <section class="tail-card space-y-3">
          <h2 class="tail-section-title">{{ t('admin.smsPage.healthTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ noteLabel(status) }}</p>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.smsPhase') }}</span>
              <strong dir="ltr">{{ status.smsPhase }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.smsMode') }}</span>
              <strong dir="ltr">{{ status.smsMode }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.resolvedProvider') }}</span>
              <strong dir="ltr">{{ status.resolvedProvider }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.smsEnabledFlag') }}</span>
              <strong dir="ltr">{{ yesNo(status.smsEnabledFlag) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.hasApiKey') }}</span>
              <strong dir="ltr">{{ yesNo(status.hasKavenegarApiKey) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.hasTemplate') }}</span>
              <strong dir="ltr">{{ yesNo(status.hasKavenegarTemplate) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.hasSender') }}</span>
              <strong dir="ltr">{{ yesNo(status.hasKavenegarSender) }}</strong>
            </li>
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.pendingScheduled') }}</span>
              <strong dir="ltr">{{ formatNumber(status.pendingScheduled) }}</strong>
            </li>
            <li v-if="status.hasOtpBypassConfigured" class="flex justify-between gap-2 text-amber-900">
              <span>{{ t('admin.smsPage.hasOtpBypass') }}</span>
              <strong dir="ltr">{{ yesNo(true) }}</strong>
            </li>
          </ul>

          <div
            v-if="warningItems.length"
            class="border border-amber-200 bg-amber-50 p-3"
            style="border-radius: 2px;"
          >
            <p class="text-xs font-bold text-amber-900">{{ t('admin.smsPage.warnings') }}</p>
            <ul class="mt-2 space-y-1 text-start text-xs text-amber-800">
              <li v-for="(warning, idx) in warningItems" :key="idx">{{ warning }}</li>
            </ul>
          </div>

          <div
            v-if="nextActionItems.length"
            class="border border-brand-primary/20 bg-brand-primary-soft/40 p-3"
            style="border-radius: 2px;"
          >
            <p class="text-xs font-bold text-brand-navy">{{ t('admin.smsPage.nextActions') }}</p>
            <ul class="mt-2 list-disc space-y-1 pe-4 text-start text-xs text-brand-navy">
              <li v-for="(action, idx) in nextActionItems" :key="idx">{{ action }}</li>
            </ul>
          </div>
        </section>

        <section class="tail-card space-y-3">
          <h2 class="tail-section-title">{{ t('admin.smsPage.queueTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ t('admin.smsPage.queueHint') }}</p>
          <p class="text-sm">
            <span class="text-brand-gray-600">{{ t('admin.smsPage.pendingScheduled') }}:</span>
            <strong class="ms-1" dir="ltr">{{ formatNumber(status.pendingScheduled) }}</strong>
            <span class="mx-2 text-brand-gray-300">·</span>
            <span class="text-brand-gray-600">{{ t('admin.smsPage.dueNow') }}:</span>
            <strong class="ms-1" dir="ltr">{{ formatNumber(status.dueNow) }}</strong>
          </p>
          <button
            type="button"
            class="bg-brand-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
            style="border-radius: 2px;"
            :disabled="processing"
            @click="processScheduled"
          >
            {{ processing ? t('admin.smsPage.processing') : t('admin.smsPage.processScheduled') }}
          </button>
          <p v-if="processError" class="venus-alert-error text-start">{{ processError }}</p>

          <div
            v-if="processResult"
            class="space-y-2 border border-brand-gray-100 bg-brand-gray-50 p-3"
            style="border-radius: 2px;"
          >
            <p class="text-sm font-bold">{{ t('admin.smsPage.lastResult') }}</p>
            <ul class="space-y-1 text-sm">
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.processed') }}</span>
                <strong dir="ltr">{{ formatNumber(processResult.processed) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.failed') }}</span>
                <strong dir="ltr">{{ formatNumber(processResult.failed) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.stillPending') }}</span>
                <strong dir="ltr">{{ formatNumber(processResult.pending) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.provider') }}</span>
                <strong dir="ltr">{{ processResult.provider }}</strong>
              </li>
            </ul>
            <p class="text-xs text-brand-gray-600" dir="ltr">{{ processResult.note }}</p>
            <div
              v-if="processResult.errors?.length"
              class="border border-red-200 bg-red-50 p-3"
              style="border-radius: 2px;"
            >
              <p class="text-xs font-bold text-red-900">{{ t('admin.smsPage.lastErrors') }}</p>
              <ul class="mt-2 space-y-1 text-xs text-red-800" dir="ltr">
                <li v-for="(err, idx) in processResult.errors" :key="idx">{{ err }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section class="tail-card space-y-3">
          <h2 class="tail-section-title">{{ t('admin.smsPage.dailyOwnerTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ t('admin.smsPage.dailyOwnerHint') }}</p>
          <button
            type="button"
            class="bg-brand-primary px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-brand-gray-300 disabled:text-brand-gray-600"
            style="border-radius: 2px;"
            :disabled="processingDaily"
            @click="processDailyOwner"
          >
            {{ processingDaily ? t('admin.smsPage.processing') : t('admin.smsPage.processDailyOwner') }}
          </button>
          <p v-if="dailyError" class="venus-alert-error text-start">{{ dailyError }}</p>

          <div
            v-if="dailyResult"
            class="space-y-2 border border-brand-gray-100 bg-brand-gray-50 p-3"
            style="border-radius: 2px;"
          >
            <p class="text-sm font-bold">{{ t('admin.smsPage.lastResult') }}</p>
            <ul class="space-y-1 text-sm">
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.dailyOwnerSent') }}</span>
                <strong dir="ltr">{{ formatNumber(dailyResult.sent) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.dailyOwnerSkipped') }}</span>
                <strong dir="ltr">{{ formatNumber(dailyResult.skippedNoPhone + dailyResult.skippedAlreadySent) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.failed') }}</span>
                <strong dir="ltr">{{ formatNumber(dailyResult.failed) }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.provider') }}</span>
                <strong dir="ltr">{{ dailyResult.provider }}</strong>
              </li>
              <li class="flex justify-between gap-2">
                <span>{{ t('admin.smsPage.dailyOwnerDate') }}</span>
                <strong dir="ltr">{{ dailyResult.date }}</strong>
              </li>
            </ul>
            <p class="text-xs text-brand-gray-600" dir="ltr">{{ dailyResult.note }}</p>
            <div
              v-if="dailyResult.errors?.length"
              class="border border-red-200 bg-red-50 p-3"
              style="border-radius: 2px;"
            >
              <p class="text-xs font-bold text-red-900">{{ t('admin.smsPage.lastErrors') }}</p>
              <ul class="mt-2 space-y-1 text-xs text-red-800" dir="ltr">
                <li v-for="(err, idx) in dailyResult.errors" :key="idx">{{ err }}</li>
              </ul>
            </div>
          </div>
        </section>

        <p
          class="border border-brand-gray-100 bg-brand-gray-50 p-3 text-xs text-brand-gray-600"
          style="border-radius: 2px;"
        >
          {{ t('admin.smsPage.cronNote') }}
        </p>
      </div>
    </AppAsyncState>
  </div>
</template>
