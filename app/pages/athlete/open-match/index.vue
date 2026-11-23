<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatIsoDate, formatFaDigits } = useFormatters()
const { localizedField } = useLocalizedField()
const { openMatchEnabled } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()

const { data, pending, error, refresh } = await useAuthedFetch<Array<{
  id: string
  status: string
  paymentMode: string
  matchType: string
  maxPlayers: number
  minLevel: number | null
  maxLevel: number | null
  openSpots: number
  pricePerPlayer: number
  note: string | null
  club: { slug: string, nameFa: string, nameEn?: string, city: string }
  sport: { nameFa: string, nameEn?: string }
  slot: { date: string, startTime: string, endTime: string }
  participants: Array<{ user: { id: string, name: string, nameFamily?: string | null } }>
}>>('/api/open-matches', { immediate: openMatchEnabled.value })

const showPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-lg font-bold text-gray-900">
      {{ t('openMatch.title') }}
    </h1>

    <CanvaEmptyState
      v-if="!openMatchEnabled"
      :title="t('openMatch.comingSoon')"
      icon="groups"
    />

    <template v-else>
      <p v-if="error" class="text-sm text-crimson">
        {{ fetchErrorMessage(error) }}
      </p>

      <CanvaEmptyState
        v-if="!showPending && !(data?.length)"
        :title="t('openMatch.noMatches')"
        icon="groups"
      />

      <div v-if="showPending" class="text-sm text-silver">
        …
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="row in data || []"
          :key="row.id"
          class="border border-line bg-white p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-charcoal">
                {{ localizedField(row.club, 'name') }}
              </h2>
              <p class="text-sm text-silver">
                {{ localizedField(row.sport, 'name') }}
                ·
                <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(row.slot.date) }}</bdi>
                <bdi dir="ltr" class="tabular-nums">{{ row.slot.startTime }}</bdi>
              </p>
              <p v-if="row.minLevel != null && row.maxLevel != null" class="text-xs text-silver">
                {{ t('openMatch.levelRange', {
                  min: formatFaDigits(String(row.minLevel)),
                  max: formatFaDigits(String(row.maxLevel)),
                }) }}
              </p>
            </div>
            <span class="text-xs text-silver">
              {{ t('openMatch.openSpots', { count: formatFaDigits(String(row.openSpots)) }) }}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span class="bg-mustard-soft px-2 py-1 text-charcoal">
              {{ row.paymentMode === 'HOST_PAYS' ? t('openMatch.paymentHost') : t('openMatch.paymentSplit') }}
            </span>
            <span class="text-silver">
              {{ row.matchType === 'COMPETITIVE' ? t('openMatch.competitive') : t('openMatch.friendly') }}
            </span>
            <span v-if="row.paymentMode === 'SPLIT_ONLINE'" class="tabular-nums text-charcoal">
              {{ t('openMatch.pricePerPlayer') }}: {{ formatCurrency(row.pricePerPlayer) }}
            </span>
          </div>

          <NuxtLink
            :to="localePath(`/athlete/open-match/${row.id}`)"
            class="mt-3 inline-flex bg-crimson px-4 py-2 text-sm font-medium text-white"
          >
            {{ t('openMatch.join') }}
          </NuxtLink>
        </article>
      </div>
    </template>
  </div>
</template>