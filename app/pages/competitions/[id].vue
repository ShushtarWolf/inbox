<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatIsoDate } = useFormatters()
const { user } = useAuth()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()
const { onlineEnabled, startCheckout, canCoverWithWallet } = useCheckout()
const { competitionsEnabled } = usePilotFlags()

const id = route.params.id as string

const { data: competition, pending, error, refresh } = await useFetch<{
  id: string
  title: string
  format: string
  enrollmentType: string
  entryFee: number
  prizeType: string
  prizeConfig: { placements: Array<{ placement: number; amount?: number; percent?: number }> } | null
  eventAt: string
  registrationOpens: string
  registrationCloses: string
  spotsLeft: number
  isFull: boolean
  status: string
  club: { slug: string; nameFa: string; nameEn?: string; city?: string; cancellationWindowHours: number }
  sport: { slug: string; nameFa: string; nameEn?: string }
}>(`/api/competitions/${id}`, { immediate: competitionsEnabled.value })

const { data: wallet } = await useAuthedFetch<{ balance?: number }>('/api/wallet', { lazy: true })

const partnerPhone = ref('')
const joinPending = ref(false)
const joinError = ref('')
const joinSuccess = ref('')
const payAtClub = ref(false)

const prizeDescription = computed(() => {
  const config = competition.value?.prizeConfig
  if (!config?.placements?.length) return ''
  return config.placements.map((p) => {
    if (competition.value?.prizeType === 'WALLET' && p.amount) {
      return t('competitions.prizeWallet', { place: p.placement, amount: formatCurrency(p.amount) })
    }
    if (p.percent) {
      return t('competitions.prizeDiscount', { place: p.placement, percent: p.percent })
    }
    return ''
  }).filter(Boolean).join(' · ')
})

async function join(useWallet = false) {
  joinError.value = ''
  joinSuccess.value = ''
  if (!user.value) {
    openLogin()
    return
  }
  joinPending.value = true
  try {
    const result = await $fetch<{
      entry: { id: string; status: string }
      payment: { id: string; amount: number; status: string } | null
    }>(`/api/competitions/${id}/join`, {
      method: 'POST',
      body: {
        partnerPhone: partnerPhone.value.trim() || undefined,
        payAtClub: payAtClub.value,
      },
    })

    if (result.entry.status === 'CONFIRMED') {
      joinSuccess.value = t('competitions.joinConfirmed')
      await refresh()
      return
    }

    if (result.payment && result.payment.status === 'PAY_AT_CLUB') {
      joinSuccess.value = t('competitions.joinPayAtClub')
      await refresh()
      return
    }

    if (result.payment && result.entry.status === 'PENDING') {
      await startCheckout({
        competitionEntryId: result.entry.id,
        useWallet,
      })
      joinSuccess.value = t('competitions.joinConfirmed')
      await refresh()
    }
  } catch (err) {
    joinError.value = fetchErrorMessage(err, t('common.error'))
  } finally {
    joinPending.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-6">
    <NuxtLink :to="localePath('/competitions')" class="mb-4 inline-block text-sm text-gray-600">
      {{ t('common.back') }}
    </NuxtLink>

    <CanvaEmptyState
      v-if="!competitionsEnabled"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <p v-else-if="pending" class="text-sm text-gray-500">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="error" class="text-sm text-red-600">
      {{ t('common.error') }}
    </p>

    <template v-else-if="competition">
      <h1 class="text-xl font-bold text-gray-900">
        {{ competition.title }}
      </h1>
      <p class="mt-2 text-sm text-gray-600">
        {{ localizedField(competition.club, 'name') }}
        <span v-if="competition.club.city"> · {{ competition.club.city }}</span>
      </p>
      <p class="mt-1 text-sm text-gray-600">
        {{ formatIsoDate(competition.eventAt) }} · {{ localizedField(competition.sport, 'name') }}
      </p>

      <dl class="mt-4 space-y-2 text-sm">
        <div>
          <dt class="font-medium text-gray-700">
            {{ t('competitions.feeLabel') }}
          </dt>
          <dd>
            {{ competition.entryFee > 0 ? formatCurrency(competition.entryFee) : t('competitions.freeEntry') }}
          </dd>
        </div>
        <div v-if="prizeDescription">
          <dt class="font-medium text-gray-700">
            {{ t('competitions.prizeLabel') }}
          </dt>
          <dd>{{ prizeDescription }}</dd>
          <dd class="mt-1 text-xs text-gray-500">
            {{ t('competitions.prizeTerms') }}
            <NuxtLink :to="localePath('/terms')" class="font-bold text-brand-primary underline">
              {{ t('legal.terms') }}
            </NuxtLink>
          </dd>
        </div>
        <div>
          <dt class="font-medium text-gray-700">
            {{ t('competitions.cancelPolicy') }}
          </dt>
          <dd>
            {{ t('competitions.cancelPolicyBody', { hours: competition.club.cancellationWindowHours }) }}
            <NuxtLink :to="localePath('/cancellation')" class="ms-1 font-bold text-brand-primary underline">
              {{ t('legal.cancellation') }}
            </NuxtLink>
          </dd>
        </div>
        <div>
          <dt class="font-medium text-gray-700">
            {{ t('competitions.capacity') }}
          </dt>
          <dd :class="competition.isFull ? 'text-red-600' : 'text-green-700'">
            {{ competition.isFull ? t('competitions.full') : t('competitions.spotsLeft', { count: competition.spotsLeft }) }}
          </dd>
        </div>
      </dl>

      <p v-if="joinSuccess" class="mt-4 text-sm text-green-700">
        {{ joinSuccess }}
      </p>
      <p v-if="joinError" class="mt-4 text-sm text-red-600">
        {{ joinError }}
      </p>

      <div v-if="!competition.isFull && competition.status === 'OPEN'" class="mt-6 space-y-3">
        <div v-if="competition.enrollmentType === 'DOUBLE'">
          <label class="block text-sm font-medium text-gray-700">
            {{ t('competitions.partnerPhone') }}
          </label>
          <input
            v-model="partnerPhone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            class="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
            :placeholder="t('competitions.partnerPhoneHint')"
          >
        </div>

        <label v-if="!onlineEnabled" class="flex items-center gap-2 text-sm">
          <input v-model="payAtClub" type="checkbox">
          {{ t('competitions.payAtClub') }}
        </label>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="joinPending"
            @click="join(false)"
          >
            {{ competition.entryFee > 0 && onlineEnabled ? t('competitions.joinAndPay') : t('competitions.join') }}
          </button>
          <button
            v-if="competition.entryFee > 0 && canCoverWithWallet(wallet?.balance, competition.entryFee, 'PENDING_ONLINE')"
            type="button"
            class="rounded-sm border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
            :disabled="joinPending"
            @click="join(true)"
          >
            {{ t('competitions.payFromWallet') }}
          </button>
        </div>
      </div>

      <p v-else-if="competition.isFull" class="mt-6 text-sm font-medium text-red-600">
        {{ t('competitions.full') }}
      </p>
    </template>
  </div>
</template>
