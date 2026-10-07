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

const showPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })

const { data: wallet } = await useAuthedFetch<{ balance?: number }>('/api/wallet', { lazy: true })

const partnerPhone = ref('')
const joinPending = ref(false)
const joinError = ref('')
const joinSuccess = ref('')

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
  const fee = competition.value?.entryFee || 0
  if (fee > 0 && !onlineEnabled.value) {
    joinError.value = t('booking.onlinePaymentsRequired')
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
      },
    })

    if (result.entry.status === 'CONFIRMED') {
      joinSuccess.value = t('competitions.joinConfirmed')
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
  <div class="tail-page-stack animate-fade-in">
    <CanvaPublicChrome back-to="/competitions" />

    <CanvaEmptyState
      v-if="!competitionsEnabled"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <AppVenusSpinner v-else-if="showPending" size="sm" :label="t('common.loading')" />
    <p v-else-if="error" class="text-sm text-brand-primary">
      {{ t('common.error') }}
    </p>

    <template v-else-if="competition">
      <h1 class="text-start text-xl font-bold text-brand-navy">
        {{ competition.title }}
      </h1>
      <p class="mt-2 text-start text-sm text-brand-gray-600">
        {{ localizedField(competition.club, 'name') }}
        <span v-if="competition.club.city"> · {{ competition.club.city }}</span>
      </p>
      <p class="mt-1 text-start text-sm text-brand-gray-600">
        <bdi dir="ltr">{{ formatIsoDate(competition.eventAt) }}</bdi>
        · {{ localizedField(competition.sport, 'name') }}
      </p>

      <dl class="mt-4 space-y-2 text-start text-sm">
        <div>
          <dt class="font-bold text-brand-navy">
            {{ t('competitions.feeLabel') }}
          </dt>
          <dd class="tabular-nums text-brand-gray-700">
            {{ competition.entryFee > 0 ? formatCurrency(competition.entryFee) : t('competitions.freeEntry') }}
          </dd>
        </div>
        <div v-if="prizeDescription">
          <dt class="font-bold text-brand-navy">
            {{ t('competitions.prizeLabel') }}
          </dt>
          <dd class="text-brand-gray-700">{{ prizeDescription }}</dd>
          <dd class="mt-1 text-xs text-brand-gray-500">
            {{ t('competitions.prizeTerms') }}
            <NuxtLink :to="localePath('/terms')" class="font-bold text-brand-primary underline">
              {{ t('legal.terms') }}
            </NuxtLink>
          </dd>
        </div>
        <div>
          <dt class="font-bold text-brand-navy">
            {{ t('competitions.cancelPolicy') }}
          </dt>
          <dd class="text-brand-gray-700">
            {{ t('competitions.cancelPolicyBody', { hours: competition.club.cancellationWindowHours }) }}
            <NuxtLink :to="localePath('/cancellation')" class="ms-1 font-bold text-brand-primary underline">
              {{ t('legal.cancellation') }}
            </NuxtLink>
          </dd>
        </div>
        <div>
          <dt class="font-bold text-brand-navy">
            {{ t('competitions.capacity') }}
          </dt>
          <dd :class="competition.isFull ? 'text-brand-primary' : 'text-emerald-700'">
            {{ competition.isFull ? t('competitions.full') : t('competitions.spotsLeft', { count: competition.spotsLeft }) }}
          </dd>
        </div>
      </dl>

      <p v-if="joinSuccess" class="mt-4 text-sm text-emerald-700">
        {{ joinSuccess }}
      </p>
      <p v-if="joinError" class="mt-4 text-sm text-brand-primary">
        {{ joinError }}
      </p>

      <div v-if="!competition.isFull && competition.status === 'OPEN'" class="mt-6 space-y-3">
        <div v-if="competition.enrollmentType === 'DOUBLE'">
          <label class="block text-start text-sm font-bold text-brand-navy">
            {{ t('competitions.partnerPhone') }}
          </label>
          <input
            v-model="partnerPhone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            class="neo-input mt-1 w-full"
            dir="ltr"
            :placeholder="t('competitions.partnerPhoneHint')"
          >
        </div>

        <label v-if="competition.entryFee > 0 && !onlineEnabled" class="text-sm text-brand-primary">
          {{ t('booking.onlinePaymentsRequired') }}
        </label>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="canva-cta"
            :disabled="joinPending || (competition.entryFee > 0 && !onlineEnabled)"
            @click="join(false)"
          >
            {{ competition.entryFee > 0 && onlineEnabled ? t('competitions.joinAndPay') : t('competitions.join') }}
          </button>
          <button
            v-if="competition.entryFee > 0 && canCoverWithWallet(wallet?.balance, competition.entryFee, 'PENDING_ONLINE')"
            type="button"
            class="canva-home-login canva-home-login-soft px-4 py-2"
            :disabled="joinPending"
            @click="join(true)"
          >
            {{ t('competitions.payFromWallet') }}
          </button>
        </div>
      </div>

      <p v-else-if="competition.isFull" class="mt-6 text-sm font-bold text-brand-primary">
        {{ t('competitions.full') }}
      </p>
    </template>
  </div>
</template>
