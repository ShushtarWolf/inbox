<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const route = useRoute()
const { t } = useI18n()
const { formatNumber, formatCurrency, formatIsoDate } = useFormatters()
const id = route.params.id as string

interface EntryRow {
  id: string
  status: string
  placement: number | null
  prizeAwarded: boolean
  athlete: { id: string; name: string | null; mobile: string | null }
  partnerAthlete: { id: string; name: string | null; mobile: string | null } | null
  payment: { status: string; amount: number } | null
  createdAt: string
}

interface CompetitionDetail {
  id: string
  title: string
  format: string
  status: string
  entryFee: number
  maxParticipants: number
  minParticipants: number
  eventAt: string
  registrationOpens: string
  registrationCloses: string
  activeCount: number
  confirmedCount: number
  spotsLeft: number
  prizesAwardedAt: string | null
  prizeType: 'WALLET' | 'DISCOUNT'
  prizeConfig: { placements: Array<{ placement: number; amount?: number; percent?: number }> } | null
  prizeAwardAudit: { winnerEntryIds?: Record<string, string> } | null
  entries: EntryRow[]
}

const { data, pending, error, refresh } = await useAuthedFetch<CompetitionDetail>(`/api/owner/competitions/${id}`)
useOwnerClubRefresh(refresh)

const showCancelModal = ref(false)
const cancelReason = ref('')
const actionPending = ref(false)
const actionError = ref('')
const markingPaidEntryId = ref<string | null>(null)

const winnerPlacements = ref<Array<{ placement: number; entryId: string }>>([
  { placement: 1, entryId: '' },
])

const canCancel = computed(() => {
  const status = data.value?.status
  return status && !['CANCELLED', 'COMPLETED'].includes(status)
})

const canComplete = computed(() => {
  const status = data.value?.status
  return status && ['CLOSED', 'IN_PROGRESS'].includes(status)
})

const canAward = computed(() => data.value?.status === 'COMPLETED' && !data.value?.prizesAwardedAt)

const confirmedEntries = computed(() =>
  (data.value?.entries ?? []).filter((entry) => entry.status === 'CONFIRMED'),
)

const placementsComplete = computed(() => {
  const placements = data.value?.prizeConfig?.placements ?? []
  if (!placements.length) return false
  return placements.every((p) =>
    winnerPlacements.value.some((row) => row.placement === p.placement && row.entryId.trim()),
  )
})

function statusLabel(status: string) {
  return t(`owner.competitionsPage.status.${status}` as 'owner.competitionsPage.status.DRAFT')
}

function entryStatusLabel(status: string) {
  return t(`competitions.entryStatus.${status}` as 'competitions.entryStatus.CONFIRMED')
}

function isPayAtClubPending(entry: EntryRow) {
  return entry.status === 'PENDING'
    && entry.payment != null
    && ['PAY_AT_CLUB', 'PENDING_AT_CLUB'].includes(entry.payment.status)
}

async function markEntryPaid(entryId: string) {
  markingPaidEntryId.value = entryId
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}/entries/${entryId}/mark-paid`, { method: 'POST' })
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    markingPaidEntryId.value = null
  }
}

async function publishCompetition() {
  actionPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}`, {
      method: 'PATCH',
      body: { publish: true },
    })
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionPending.value = false
  }
}

async function confirmCancel() {
  actionPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}/cancel`, {
      method: 'POST',
      body: { reason: cancelReason.value.trim() || undefined },
    })
    showCancelModal.value = false
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionPending.value = false
  }
}

async function markComplete() {
  actionPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}/complete`, { method: 'POST' })
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionPending.value = false
  }
}

async function savePlacements() {
  actionPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}/placements`, {
      method: 'PATCH',
      body: { placements: winnerPlacements.value },
    })
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionPending.value = false
  }
}

async function awardPrizes() {
  if (!placementsComplete.value) {
    actionError.value = t('owner.competitionsPage.placementsIncomplete')
    return
  }
  actionPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/owner/competitions/${id}/placements`, {
      method: 'PATCH',
      body: { placements: winnerPlacements.value },
    })
    await $fetch(`/api/owner/competitions/${id}/award-prizes`, { method: 'POST' })
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    actionPending.value = false
  }
}

watch(
  () => data.value?.prizeConfig?.placements,
  (placements) => {
    if (placements?.length) {
      const byPlacement = new Map(
        (data.value?.entries ?? [])
          .filter((e) => e.placement != null)
          .map((e) => [e.placement!, e.id]),
      )
      winnerPlacements.value = placements.map((p) => ({
        placement: p.placement,
        entryId: byPlacement.get(p.placement) ?? '',
      }))
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/competitions" :title="data?.title || t('owner.competitions')" />

    <AppAsyncState :pending="pending" :error="error" :empty="!data" skeleton-variant="default">
      <div v-if="data" class="venus-page-stack">
        <section class="canva-panel space-y-2">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h1 class="text-start text-xl font-bold text-brand-navy">{{ data.title }}</h1>
              <p class="text-sm text-brand-gray-600">{{ data.format }}</p>
            </div>
            <span class="neo-badge">{{ statusLabel(data.status) }}</span>
          </div>
          <p class="text-sm text-brand-gray-600">
            {{ formatCurrency(data.entryFee) }}
            · {{ formatNumber(data.confirmedCount) }}/{{ formatNumber(data.maxParticipants) }}
            · {{ t('owner.competitionsPage.minParticipants') }}: {{ formatNumber(data.minParticipants) }}
          </p>
          <p class="text-xs text-brand-gray-500">
            <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(data.eventAt) }}</bdi>
          </p>
        </section>

        <div v-if="data.status === 'DRAFT'" class="canva-panel">
          <button type="button" class="canva-black-cta w-full" :disabled="actionPending" @click="publishCompetition">
            {{ t('owner.competitionsPage.publish') }}
          </button>
        </div>

        <div v-if="canCancel" class="canva-panel">
          <button type="button" class="canva-gate-btn-secondary w-full text-red-700" @click="showCancelModal = true">
            {{ t('owner.competitionsPage.cancelEvent') }}
          </button>
        </div>

        <div v-if="canComplete" class="canva-panel">
          <button type="button" class="canva-black-cta w-full" :disabled="actionPending" @click="markComplete">
            {{ t('owner.competitionsPage.markComplete') }}
          </button>
        </div>

        <div v-if="data.prizesAwardedAt" class="canva-panel">
          <p class="text-sm font-bold text-emerald-700">{{ t('owner.competitionsPage.prizesAwarded') }}</p>
        </div>

        <div v-if="canAward" class="canva-panel space-y-3">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.competitionsPage.awardPrizes') }}</h2>
          <p class="text-xs text-brand-gray-600">{{ t('owner.competitionsPage.awardPrizesHint') }}</p>
          <div v-for="row in winnerPlacements" :key="row.placement" class="space-y-1">
            <label class="text-xs font-bold text-brand-gray-600">
              {{ t('owner.competitionsPage.placement', { n: row.placement }) }}
            </label>
            <select v-model="row.entryId" class="neo-input">
              <option value="">{{ t('owner.competitionsPage.selectWinner') }}</option>
              <option
                v-for="entry in confirmedEntries"
                :key="entry.id"
                :value="entry.id"
              >
                {{ entry.athlete.name || entry.athlete.id }}
                <template v-if="entry.partnerAthlete"> + {{ entry.partnerAthlete.name || entry.partnerAthlete.id }}</template>
              </option>
            </select>
          </div>
          <button type="button" class="canva-gate-btn-secondary w-full" :disabled="actionPending" @click="savePlacements">
            {{ t('owner.competitionsPage.savePlacements') }}
          </button>
          <button type="button" class="canva-black-cta w-full" :disabled="actionPending || !placementsComplete" @click="awardPrizes">
            {{ t('owner.competitionsPage.awardPrizes') }}
          </button>
        </div>

        <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>

        <section class="canva-panel space-y-3">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.competitionsPage.entriesTitle') }}</h2>
          <CanvaEmptyState v-if="!data.entries.length" :title="t('owner.competitionsPage.noEntries')" icon="groups" />
          <div v-for="entry in data.entries" :key="entry.id" class="canva-list-card">
            <div class="flex items-center justify-between gap-2">
              <p class="font-bold text-brand-navy">{{ entry.athlete.name || entry.athlete.id }}</p>
              <span class="neo-badge">{{ entryStatusLabel(entry.status) }}</span>
            </div>
            <p v-if="entry.partnerAthlete" class="mt-1 text-xs text-brand-gray-600">
              + {{ entry.partnerAthlete.name || entry.partnerAthlete.id }}
            </p>
            <p v-if="entry.placement" class="mt-1 text-xs font-bold text-brand-navy">
              {{ t('owner.competitionsPage.placement', { n: entry.placement }) }}
              <span v-if="entry.prizeAwarded" class="text-emerald-700"> · {{ t('owner.competitionsPage.prizeCredited') }}</span>
            </p>
            <p v-if="entry.payment" class="mt-1 text-xs text-brand-gray-500">
              {{ entry.payment.status }} · {{ formatCurrency(entry.payment.amount) }}
            </p>
            <button
              v-if="isPayAtClubPending(entry)"
              type="button"
              class="canva-black-cta mt-2 w-full"
              :disabled="markingPaidEntryId === entry.id"
              @click="markEntryPaid(entry.id)"
            >
              {{ markingPaidEntryId === entry.id ? t('common.loading') : t('owner.competitionsPage.confirmPayment') }}
            </button>
          </div>
        </section>
      </div>
    </AppAsyncState>

    <AppModal
      :open="showCancelModal"
      sheet
      patterned
      :title="t('owner.competitionsPage.cancelTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="showCancelModal = false"
    >
      <div class="venus-form-stack p-4">
        <p class="text-sm text-brand-gray-600">{{ t('owner.competitionsPage.cancelBody') }}</p>
        <AppFormField :label="t('owner.competitionsPage.cancelReason')">
          <input
            v-model="cancelReason"
            class="neo-input"
            :placeholder="t('owner.competitionsPage.cancelReasonPlaceholder')"
          />
        </AppFormField>
        <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
        <button type="button" class="canva-black-cta" :disabled="actionPending" @click="confirmCancel">
          {{ actionPending ? t('common.loading') : t('owner.competitionsPage.cancelConfirm') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="actionPending" @click="showCancelModal = false">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
