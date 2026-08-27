<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatIsoDate } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { competitionsEnabled } = usePilotFlags()

const { data, pending, error, refresh } = await useAuthedFetch<Array<{
  id: string
  status: string
  placement: number | null
  isPrimaryRegistrant: boolean
  prizeStatus: 'none' | 'pending' | 'credited'
  prizeGoesToRegistrant: boolean
  prizeAward: {
    prizeType: string
    amount: number | null
    percent: number | null
    discountCode: string | null
    discountEndsAt: string | null
  } | null
  createdAt: string
  payment?: { status?: string; amount?: number } | null
  competition: {
    id: string
    title: string
    eventAt: string
    entryFee: number
    prizeType: string
    club: { slug: string; nameFa: string; nameEn?: string }
    sport: { nameFa: string; nameEn?: string }
  }
}>>('/api/athlete/competitions', { immediate: competitionsEnabled.value })

const route = useRoute()
const router = useRouter()
const cancelPending = ref<string | null>(null)
const actionError = ref('')
const paymentFlash = ref('')
const refundNotice = ref('')

watch(
  () => route.query.payment,
  async (value) => {
    if (value === 'success') {
      paymentFlash.value = t('booking.paymentSuccess')
      await refresh()
    } else if (value === 'cancelled') {
      paymentFlash.value = t('booking.paymentCancelled')
    } else if (value === 'error') {
      paymentFlash.value = t('booking.paymentError')
    } else {
      return
    }
    const query = { ...route.query }
    delete query.payment
    router.replace({ path: route.path, query })
  },
  { immediate: true },
)

function prizeStatusLabel(entry: NonNullable<typeof data.value>[number]) {
  if (entry.prizeGoesToRegistrant) return t('competitions.prizeGoesToRegistrant')
  if (entry.prizeStatus === 'pending') return t('competitions.prizePending')
  if (entry.prizeStatus === 'credited') return t('competitions.prizeCredited')
  return ''
}

function statusLabel(status: string) {
  const key = `competitions.entryStatus.${status}` as const
  return t(key)
}

function canCancelEntry(entry: NonNullable<typeof data.value>[number]) {
  return entry.status === 'PENDING' || entry.status === 'CONFIRMED'
}

async function cancelEntry(competitionId: string) {
  actionError.value = ''
  refundNotice.value = ''
  cancelPending.value = competitionId
  try {
    const result = await $fetch<{
      refund?: { walletCredited?: boolean; refunded?: boolean; gatewayRefunded?: boolean } | null
      refundPending?: boolean
    }>(`/api/competitions/${competitionId}/cancel-entry`, { method: 'POST' })
    if (result.refundPending) {
      refundNotice.value = t('competitions.refundPending')
    } else if (result.refund?.walletCredited) {
      refundNotice.value = t('competitions.refundToWallet')
    } else if (result.refund?.gatewayRefunded || result.refund?.refunded) {
      refundNotice.value = t('competitions.refundToGateway')
    }
    await refresh()
  } catch (err) {
    actionError.value = fetchErrorMessage(err)
  } finally {
    cancelPending.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-lg font-bold text-gray-900">
      {{ t('competitions.myEntries') }}
    </h1>

    <CanvaEmptyState
      v-if="!competitionsEnabled"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <template v-else>
      <NuxtLink :to="localePath('/competitions')" class="text-sm text-red-600">
        {{ t('competitions.browse') }}
      </NuxtLink>

    <p v-if="paymentFlash" class="text-sm text-emerald-700">
      {{ paymentFlash }}
    </p>
    <p v-if="refundNotice" class="text-sm text-emerald-700">
      {{ refundNotice }}
    </p>
    <p v-if="pending" class="text-sm text-gray-500">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="error" class="text-sm text-red-600">
      {{ t('common.error') }}
    </p>
    <p v-else-if="actionError" class="text-sm text-red-600">
      {{ actionError }}
    </p>
    <p v-else-if="!data?.length" class="text-sm text-gray-500">
      {{ t('competitions.noEntries') }}
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="entry in data"
        :key="entry.id"
        class="border border-gray-200 p-3"
      >
        <NuxtLink :to="localePath(`/competitions/${entry.competition.id}`)" class="font-semibold text-gray-900">
          {{ entry.competition.title }}
        </NuxtLink>
        <p class="mt-1 text-sm text-gray-600">
          {{ localizedField(entry.competition.club, 'name') }}
          · {{ formatIsoDate(entry.competition.eventAt) }}
        </p>
        <p class="mt-1 text-sm">
          {{ statusLabel(entry.status) }}
          <span v-if="entry.placement"> · {{ t('owner.competitionsPage.placement', { n: entry.placement }) }}</span>
          <span v-if="entry.payment?.amount">
            · {{ formatCurrency(entry.payment.amount) }}
          </span>
        </p>
        <p v-if="prizeStatusLabel(entry)" class="mt-1 text-sm font-medium text-emerald-700">
          {{ prizeStatusLabel(entry) }}
        </p>
        <p v-if="entry.prizeAward?.discountCode" class="mt-1 text-sm text-gray-700" dir="ltr">
          {{ t('competitions.prizeDiscountCode', { code: entry.prizeAward.discountCode }) }}
        </p>
        <button
          v-if="canCancelEntry(entry)"
          type="button"
          class="mt-2 text-sm text-red-600 disabled:opacity-50"
          :disabled="cancelPending === entry.competition.id"
          @click="cancelEntry(entry.competition.id)"
        >
          {{ t('competitions.cancelEntry') }}
        </button>
      </li>
    </ul>
    </template>
  </div>
</template>
