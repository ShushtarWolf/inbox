<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
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
  hasOtpBypassConfigured?: boolean
  pendingScheduled: number
  dueNow: number
  warnings: string[]
  nextActions?: string[]
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

const status = ref<SmsStatus | null>(null)
const pending = ref(false)
const processing = ref(false)
const loadError = ref('')
const processResult = ref<ProcessResult | null>(null)
const processError = ref('')

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

function yesNo(value: boolean) {
  return value ? t('admin.smsPage.yes') : t('admin.smsPage.no')
}

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
      <button type="button" class="btn-secondary text-xs" :disabled="pending" @click="load">
        {{ t('common.retry') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="status" class="space-y-6">
        <div
          class="rounded-lg border p-3 text-sm font-bold"
          :class="status.smsPhase === 'MULTI'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-amber-200 bg-amber-50 text-amber-900'"
        >
          {{ status.smsPhase === 'MULTI' ? t('admin.smsPage.phaseMultiBanner') : t('admin.smsPage.phaseSingleBanner') }}
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
            :label="t('admin.smsPage.provider')"
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
          <p class="text-sm text-brand-gray-600">{{ status.note }}</p>
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
            <li class="flex justify-between gap-2">
              <span>{{ t('admin.smsPage.hasOtpBypass') }}</span>
              <strong dir="ltr">{{ yesNo(Boolean(status.hasOtpBypassConfigured)) }}</strong>
            </li>
          </ul>

          <div v-if="status.warnings?.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p class="text-xs font-bold text-amber-900">{{ t('admin.smsPage.warnings') }}</p>
            <ul class="mt-2 space-y-1 text-xs text-amber-800" dir="ltr">
              <li v-for="(warning, idx) in status.warnings" :key="idx">{{ warning }}</li>
            </ul>
          </div>

          <div v-if="status.nextActions?.length" class="rounded-lg border border-brand-primary/20 bg-brand-primary-soft/40 p-3">
            <p class="text-xs font-bold text-brand-navy">{{ t('admin.smsPage.nextActions') }}</p>
            <ul class="mt-2 list-disc space-y-1 pe-4 text-xs text-brand-navy" dir="ltr">
              <li v-for="(action, idx) in status.nextActions" :key="idx">{{ action }}</li>
            </ul>
          </div>
        </section>

        <section class="tail-card space-y-3">
          <h2 class="tail-section-title">{{ t('admin.smsPage.queueTitle') }}</h2>
          <p class="text-sm text-brand-gray-600">{{ t('admin.smsPage.queueHint') }}</p>
          <button
            type="button"
            class="btn-primary"
            :disabled="processing"
            @click="processScheduled"
          >
            {{ processing ? t('admin.smsPage.processing') : t('admin.smsPage.processScheduled') }}
          </button>
          <p v-if="processError" class="text-sm text-red-700">{{ processError }}</p>

          <div v-if="processResult" class="rounded-lg border border-brand-gray-100 bg-brand-gray-50 p-3 space-y-2">
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
            <div v-if="processResult.errors?.length" class="rounded-lg border border-red-200 bg-red-50 p-3">
              <p class="text-xs font-bold text-red-900">{{ t('admin.smsPage.lastErrors') }}</p>
              <ul class="mt-2 space-y-1 text-xs text-red-800" dir="ltr">
                <li v-for="(err, idx) in processResult.errors" :key="idx">{{ err }}</li>
              </ul>
            </div>
          </div>
        </section>

        <p class="rounded-lg border border-brand-gray-100 bg-brand-gray-50 p-3 text-xs text-brand-gray-600">
          {{ t('admin.smsPage.cronNote') }}
        </p>
      </div>
    </AppAsyncState>
  </div>
</template>
