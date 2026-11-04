<script setup lang="ts">
import { toAsciiDigits } from '#shared/digits.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatNumber, formatDate } = useFormatters()

type CommissionPayload = {
  commissionBps: number
  source: 'database' | 'env_fallback'
  envBootstrapBps: number
  coachCommissionBps: number
  coachUsesEnvOverride: boolean
  warnings: Array<{ code: string; message: string }>
  history: Array<{
    id: string
    fromBps: number
    toBps: number
    actor: string
    ackRefundRisk: boolean
    createdAt: string
  }>
}

const data = ref<CommissionPayload | null>(null)
const pending = ref(false)
const loadError = ref('')
const percentInput = ref('')
const confirmRefundRisk = ref(false)
const saveError = ref('')
const saveOk = ref(false)
const saving = ref(false)

function formatBpsPercent(bps: number) {
  return `${formatNumber(bps / 100)}٪`
}

watch(data, (value) => {
  if (value) percentInput.value = String(value.commissionBps / 100)
})

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  saveOk.value = false
  try {
    data.value = await adminFetch<CommissionPayload>('/api/admin/platform-commission')
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

async function save() {
  if (!data.value) return
  saveError.value = ''
  saveOk.value = false
  const pct = Number(toAsciiDigits(percentInput.value.trim()))
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    saveError.value = t('admin.commissionInvalid')
    return
  }
  const commissionBps = Math.round(pct * 100)
  if (commissionBps > 0 && !confirmRefundRisk.value) {
    saveError.value = t('admin.platformCommission.confirmRequired')
    return
  }
  saving.value = true
  try {
    data.value = await adminFetch<CommissionPayload>('/api/admin/platform-commission', {
      method: 'PATCH',
      body: {
        commissionBps,
        confirmRefundRisk: commissionBps > 0 ? true : undefined,
      },
    })
    confirmRefundRisk.value = false
    saveOk.value = true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 400) saveError.value = t('admin.platformCommission.confirmRequired')
    else saveError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <section class="admin-overview-hero">
      <h1 class="text-2xl font-bold text-white">{{ t('admin.platformCommission.title') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('admin.platformCommission.subtitle') }}</p>
    </section>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="data" class="space-y-5">
        <div v-for="warn in data.warnings" :key="warn.code" class="venus-alert-warning text-start" role="alert">
          <p class="font-bold">{{ t('admin.platformCommission.refundRiskTitle') }}</p>
          <p class="mt-1 text-sm">{{ warn.message }}</p>
        </div>

        <div class="tail-card space-y-3">
          <p class="text-sm">
            {{ t('admin.platformCommission.currentRate') }}:
            <strong class="tabular-nums">{{ formatBpsPercent(data.commissionBps) }}</strong>
            <span class="ms-2 text-xs text-brand-gray-500">
              ({{ data.source === 'database' ? t('admin.platformCommission.sourceDatabase') : t('admin.platformCommission.sourceEnv') }})
            </span>
          </p>
          <p class="text-sm">
            {{ t('admin.platformCommission.coachRate') }}:
            <strong class="tabular-nums">{{ formatBpsPercent(data.coachCommissionBps) }}</strong>
            <span v-if="data.coachUsesEnvOverride" class="ms-2 text-xs text-brand-gray-500">
              — {{ t('admin.platformCommission.coachEnvOverride') }}
            </span>
          </p>
          <p class="text-xs text-brand-gray-600">
            {{ t('admin.platformCommission.envBootstrap') }}:
            <bdi dir="ltr" class="tabular-nums">{{ formatBpsPercent(data.envBootstrapBps) }}</bdi>
          </p>
          <p class="text-xs text-brand-gray-600">
            {{ t('admin.platformCommission.perClubHint') }}
            <NuxtLink :to="localePath('/admin/clubs')" class="underline">{{ t('admin.nav.clubs') }}</NuxtLink>
          </p>
        </div>

        <div class="tail-card">
          <label for="platform-commission-percent" class="text-xs font-bold text-brand-gray-600">
            {{ t('admin.platformCommission.percentLabel') }}
            <input
              id="platform-commission-percent"
              v-model="percentInput"
              type="text"
              inputmode="decimal"
              dir="ltr"
              class="mt-1 block w-32 border border-brand-gray-300 px-3 py-2 text-sm tabular-nums"
              style="border-radius: 0;"
            >
          </label>

          <div v-if="Number(toAsciiDigits(percentInput.trim())) > 0" class="mt-3">
            <p class="text-xs text-brand-gray-600">{{ t('admin.platformCommission.refundRiskBody') }}</p>
            <label class="mt-2 flex cursor-pointer items-start gap-2 text-sm">
              <input v-model="confirmRefundRisk" type="checkbox" class="mt-1">
              <span>{{ t('admin.platformCommission.confirmRefundRisk') }}</span>
            </label>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="bg-brand-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
              style="border-radius: 0;"
              :disabled="saving"
              @click="save"
            >
              {{ saving ? t('common.loading') : t('admin.platformCommission.save') }}
            </button>
          </div>
          <p v-if="saveError" class="mt-2 text-xs font-bold text-red-700">{{ saveError }}</p>
          <p v-if="saveOk" class="mt-2 text-xs font-bold text-green-800">{{ t('admin.platformCommission.saved') }}</p>
        </div>

        <div class="tail-card overflow-x-auto">
          <h2 class="tail-section-title mb-3">{{ t('admin.platformCommission.historyTitle') }}</h2>
          <p v-if="!data.history.length" class="text-sm text-brand-gray-600">{{ t('admin.platformCommission.historyEmpty') }}</p>
          <table v-else class="w-full min-w-[32rem] text-start text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 text-xs text-brand-gray-500">
                <th class="py-2 pe-3">{{ t('admin.platformCommission.historyWhen') }}</th>
                <th class="py-2 pe-3">{{ t('admin.platformCommission.historyFrom') }}</th>
                <th class="py-2 pe-3">{{ t('admin.platformCommission.historyTo') }}</th>
                <th class="py-2 pe-3">{{ t('admin.platformCommission.historyActor') }}</th>
                <th class="py-2">{{ t('admin.platformCommission.historyAck') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.history" :key="row.id" class="border-b border-brand-gray-50">
                <td class="py-2 pe-3 tabular-nums" dir="ltr">{{ formatDate(row.createdAt) }}</td>
                <td class="py-2 pe-3 tabular-nums">{{ formatBpsPercent(row.fromBps) }}</td>
                <td class="py-2 pe-3 tabular-nums">{{ formatBpsPercent(row.toBps) }}</td>
                <td class="py-2 pe-3 font-mono text-xs" dir="ltr">{{ row.actor }}</td>
                <td class="py-2">{{ row.ackRefundRisk ? '✓' : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>
