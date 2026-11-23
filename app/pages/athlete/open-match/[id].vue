<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { formatCurrency, formatFaDigits, formatIsoDate } = useFormatters()
const { localizedField } = useLocalizedField()
const { openMatchEnabled } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()
const { startCheckout } = useCheckout()

const id = computed(() => String(route.params.id || ''))

const { data, pending, error, refresh } = await useAuthedFetch<{
  match: {
    id: string
    status: string
    paymentMode: string
    matchType: string
    note: string | null
    sportId: string
    slotTotalPrice: number
  }
  pricePerPlayer: number
  openSpots: number
  viewerSkill: { rating: number | null, assessmentStatus: string }
  participants: Array<{
    id: string
    userId: string
    isHost: boolean
    shareAmount: number
    payment?: { id: string, status: string } | null
    skill: { rating: number, assessmentStatus: string } | null
    user: { id: string, name: string, nameFamily?: string | null }
  }>
  match: {
    club: { nameFa: string, nameEn?: string, slug: string }
    sport: { nameFa: string, nameEn?: string }
    slot: { date: string, startTime: string, endTime: string }
  }
}>(`/api/open-matches/${id.value}`, { immediate: openMatchEnabled.value })

const actionError = ref('')
const actionPending = ref(false)
const showAssess = ref(false)
const assessPending = ref(false)

const assessForm = reactive({
  experienceYears: 2,
  matchesPerMonth: 8,
  techniqueSelf: 3,
  tacticsSelf: 3,
})

async function joinMatch() {
  actionError.value = ''
  actionPending.value = true
  try {
    const result = await $fetch<{
      payment?: { status?: string } | null
      participant?: { id: string }
    }>(`/api/open-matches/${id.value}/join`, { method: 'POST' })
    if (result.payment && result.participant?.id) {
      await startCheckout({ openMatchParticipantId: result.participant.id, useWallet: true })
      return
    }
    await refresh()
  } catch (err) {
    const msg = fetchErrorMessage(err)
    if (msg.includes('OPEN_MATCH_LEVEL_MISMATCH') || msg.includes('UNASSESSED')) {
      showAssess.value = true
    }
    actionError.value = msg
  } finally {
    actionPending.value = false
  }
}

async function submitAssessment() {
  if (!data.value?.match.sportId) return
  assessPending.value = true
  actionError.value = ''
  try {
    await $fetch('/api/athlete/skill-ratings/assess', {
      method: 'POST',
      body: {
        sportId: data.value.match.sportId,
        answers: { ...assessForm },
      },
    })
    showAssess.value = false
    await refresh()
    await joinMatch()
  } catch (err) {
    actionError.value = fetchErrorMessage(err)
  } finally {
    assessPending.value = false
  }
}

async function leaveMatch() {
  actionError.value = ''
  actionPending.value = true
  try {
    await $fetch(`/api/open-matches/${id.value}/leave`, { method: 'POST' })
    await refresh()
  } catch (err) {
    actionError.value = fetchErrorMessage(err)
  } finally {
    actionPending.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <CanvaSubpageHeader :to="localePath('/athlete/open-match')" :title="t('openMatch.detailTitle')" />

    <CanvaEmptyState
      v-if="!openMatchEnabled"
      :title="t('openMatch.comingSoon')"
      icon="groups"
    />

    <template v-else-if="data">
      <section class="border border-line bg-white p-4 space-y-2">
        <h1 class="text-lg font-bold text-charcoal">
          {{ localizedField(data.match.club, 'name') }}
        </h1>
        <p class="text-sm text-silver">
          {{ localizedField(data.match.sport, 'name') }}
          ·
          <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(data.match.slot.date) }}</bdi>
          <bdi dir="ltr" class="tabular-nums">{{ data.match.slot.startTime }}</bdi>
        </p>
        <p class="text-sm">
          {{ t('openMatch.openSpots', { count: formatFaDigits(String(data.openSpots)) }) }}
        </p>
        <p v-if="data.match.paymentMode === 'SPLIT_ONLINE'" class="tabular-nums text-sm">
          {{ t('openMatch.pricePerPlayer') }}: {{ formatCurrency(data.pricePerPlayer) }}
        </p>
        <p v-if="data.viewerSkill.rating != null" class="text-sm text-silver">
          {{ t('openMatch.yourLevel') }}:
          <span class="tabular-nums text-charcoal">{{ formatFaDigits(String(data.viewerSkill.rating)) }}</span>
        </p>
      </section>

      <section class="border border-line bg-white p-4">
        <h2 class="mb-2 font-semibold text-charcoal">
          {{ t('openMatch.participants') }}
        </h2>
        <ul class="space-y-2 text-sm">
          <li v-for="p in data.participants" :key="p.id" class="flex justify-between gap-2">
            <span>{{ p.user.name }} {{ p.user.nameFamily || '' }}</span>
            <span v-if="p.skill" class="tabular-nums text-silver">
              {{ formatFaDigits(String(p.skill.rating)) }}
            </span>
          </li>
        </ul>
      </section>

      <p v-if="actionError" class="text-sm text-crimson">
        {{ actionError }}
      </p>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="bg-crimson px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          :disabled="actionPending || data.openSpots <= 0"
          @click="joinMatch"
        >
          {{ t('openMatch.join') }}
        </button>
        <button
          type="button"
          class="border border-line px-4 py-2 text-sm text-charcoal disabled:opacity-50"
          :disabled="actionPending"
          @click="leaveMatch"
        >
          {{ t('openMatch.leave') }}
        </button>
      </div>

      <AppModal v-model="showAssess" :title="t('openMatch.assessTitle')">
        <div class="space-y-3 text-sm">
          <label class="block">
            {{ t('openMatch.experienceYears') }}
            <input v-model.number="assessForm.experienceYears" type="number" min="0" class="mt-1 w-full border border-line p-2" dir="ltr">
          </label>
          <label class="block">
            {{ t('openMatch.matchesPerMonth') }}
            <input v-model.number="assessForm.matchesPerMonth" type="number" min="0" class="mt-1 w-full border border-line p-2" dir="ltr">
          </label>
          <label class="block">
            {{ t('openMatch.techniqueSelf') }}
            <input v-model.number="assessForm.techniqueSelf" type="number" min="1" max="5" class="mt-1 w-full border border-line p-2" dir="ltr">
          </label>
          <label class="block">
            {{ t('openMatch.tacticsSelf') }}
            <input v-model.number="assessForm.tacticsSelf" type="number" min="1" max="5" class="mt-1 w-full border border-line p-2" dir="ltr">
          </label>
          <button
            type="button"
            class="w-full bg-crimson py-2 text-white disabled:opacity-50"
            :disabled="assessPending"
            @click="submitAssessment"
          >
            {{ t('openMatch.assessCta') }}
          </button>
        </div>
      </AppModal>
    </template>

    <p v-else-if="error" class="text-sm text-crimson">
      {{ fetchErrorMessage(error) }}
    </p>
    <p v-else-if="pending" class="text-sm text-silver">
      …
    </p>
  </div>
</template>