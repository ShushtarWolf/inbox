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
  prizeStatus: 'none' | 'pending' | 'credited'
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

const cancelPending = ref<string | null>(null)
const actionError = ref('')

function prizeStatusLabel(entry: NonNullable<typeof data.value>[number]) {
  if (entry.prizeStatus === 'pending') return t('competitions.prizePending')
  if (entry.prizeStatus === 'credited') return t('competitions.prizeCredited')
  return ''
}

function statusLabel(status: string) {
  const key = `competitions.entryStatus.${status}` as const
  return t(key)
}

async function cancelEntry(competitionId: string) {
  actionError.value = ''
  cancelPending.value = competitionId
  try {
    await $fetch(`/api/competitions/${competitionId}/cancel-entry`, { method: 'POST' })
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
          v-if="entry.status === 'PENDING' || entry.status === 'CONFIRMED'"
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
