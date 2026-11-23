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

type OpenMatchDetailPayload = {
  match: {
    id: string
    status: string
    paymentMode: string
    matchType: string
    note: string | null
    sportId: string
    slotTotalPrice: number
    club: { nameFa: string, nameEn?: string, slug: string }
    sport: { slug: string, nameFa: string, nameEn?: string }
    slot: { date: string, startTime: string, endTime: string }
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
}

const { data, pending, error, refresh } = useAuthedFetch<OpenMatchDetailPayload>(
  () => `/api/open-matches/${id.value}`,
  { immediate: openMatchEnabled.value, lazy: true },
)

const detail = computed(() => {
  const raw = data.value
  if (!raw || Array.isArray(raw) || !raw.match) return null
  return raw
})

const actionError = ref('')
const actionPending = ref(false)
const showAssess = ref(false)

onMounted(() => {
  if (route.query.previewAssess === '1') showAssess.value = true
})

const scoreForm = reactive({ home: 6, away: 4 })
const peerForm = reactive({ level: 4, fairPlay: 5, targetUserId: '' })
const postMatchPending = ref(false)

const assessSport = computed(() => {
  const m = detail.value?.match
  if (!m?.sportId || !m.sport) return null
  return {
    id: m.sportId,
    slug: m.sport.slug || 'general',
    nameFa: m.sport.nameFa,
  }
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

async function onAssessDone() {
  showAssess.value = false
  await refresh()
  await joinMatch()
}

watch(detail, (val) => {
  const other = val?.participants.find((p) => !p.isHost)
  if (other) peerForm.targetUserId = other.userId
}, { immediate: true })

async function submitPostMatch() {
  if (!detail.value) return
  postMatchPending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/open-matches/${id.value}/results`, {
      method: 'POST',
      body: { score: { home: scoreForm.home, away: scoreForm.away } },
    })
    if (peerForm.targetUserId) {
      await $fetch(`/api/open-matches/${id.value}/peer-ratings`, {
        method: 'POST',
        body: {
          ratings: [{
            toUserId: peerForm.targetUserId,
            perceivedLevel: peerForm.level,
            fairPlayScore: peerForm.fairPlay,
          }],
        },
      })
    }
    await refresh()
  } catch (err) {
    actionError.value = fetchErrorMessage(err)
  } finally {
    postMatchPending.value = false
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

    <template v-else-if="detail">
      <section class="border border-brand-gray-200 bg-white p-4 space-y-2">
        <h1 class="text-lg font-bold text-brand-navy">
          {{ localizedField(detail.match.club, 'name') }}
        </h1>
        <p class="text-sm text-brand-gray-500">
          {{ localizedField(detail.match.sport, 'name') }}
          ·
          <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(detail.match.slot.date) }}</bdi>
          <bdi dir="ltr" class="tabular-nums">{{ detail.match.slot.startTime }}</bdi>
        </p>
        <p class="text-sm">
          {{ t('openMatch.openSpots', { count: formatFaDigits(String(detail.openSpots)) }) }}
        </p>
        <p v-if="detail.match.paymentMode === 'SPLIT_ONLINE'" class="tabular-nums text-sm">
          {{ t('openMatch.pricePerPlayer') }}: {{ formatCurrency(detail.pricePerPlayer) }}
        </p>
        <p v-if="detail.viewerSkill.rating != null" class="text-sm text-brand-gray-500">
          {{ t('openMatch.yourLevel') }}:
          <span class="tabular-nums text-brand-navy">{{ formatFaDigits(String(detail.viewerSkill.rating)) }}</span>
        </p>
      </section>

      <section class="border border-brand-gray-200 bg-white p-4">
        <h2 class="mb-2 font-semibold text-brand-navy">
          {{ t('openMatch.participants') }}
        </h2>
        <ul class="space-y-2 text-sm">
          <li v-for="p in detail.participants" :key="p.id" class="flex justify-between gap-2">
            <span>{{ p.user.name }} {{ p.user.nameFamily || '' }}</span>
            <span v-if="p.skill" class="tabular-nums text-brand-gray-500">
              {{ formatFaDigits(String(p.skill.rating)) }}
            </span>
          </li>
        </ul>
      </section>

      <p v-if="actionError" class="text-sm text-brand-primary">
        {{ actionError }}
      </p>

      <section
        v-if="detail.match.status === 'COMPLETED'"
        class="space-y-3 border border-brand-gray-200 bg-white p-4"
      >
        <h2 class="font-semibold text-brand-navy">
          {{ t('openMatch.postMatchTitle') }}
        </h2>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <label class="block">
            {{ t('openMatch.scoreHome') }}
            <input v-model.number="scoreForm.home" type="number" min="0" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
          </label>
          <label class="block">
            {{ t('openMatch.scoreAway') }}
            <input v-model.number="scoreForm.away" type="number" min="0" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
          </label>
        </div>
        <label class="block text-sm">
          {{ t('openMatch.peerLevel') }}
          <input v-model.number="peerForm.level" type="number" min="1" max="7" step="0.1" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
        </label>
        <label class="block text-sm">
          {{ t('openMatch.fairPlay') }}
          <input v-model.number="peerForm.fairPlay" type="number" min="1" max="5" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
        </label>
        <button
          type="button"
          class="w-full bg-brand-primary py-2 text-sm text-white disabled:opacity-50"
          :disabled="postMatchPending"
          @click="submitPostMatch"
        >
          {{ t('openMatch.savePostMatch') }}
        </button>
      </section>

      <div v-else class="flex flex-wrap gap-2">
        <button
          v-if="detail.viewerSkill.assessmentStatus === 'UNASSESSED'"
          type="button"
          class="border border-brand-primary bg-white px-4 py-2 text-sm font-bold text-brand-primary"
          @click="showAssess = true"
        >
          {{ t('openMatch.assessSkillCta') }}
        </button>
        <button
          type="button"
          class="bg-brand-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="actionPending || detail.openSpots <= 0"
          @click="joinMatch"
        >
          {{ t('openMatch.join') }}
        </button>
        <button
          type="button"
          class="border border-brand-gray-200 px-4 py-2 text-sm text-brand-navy disabled:opacity-50"
          :disabled="actionPending"
          @click="leaveMatch"
        >
          {{ t('openMatch.leave') }}
        </button>
      </div>

      <SkillAssessmentWizard
        v-if="assessSport"
        :open="showAssess"
        :sport-id="assessSport.id"
        :sport-slug="assessSport.slug"
        :sport-name-fa="assessSport.nameFa"
        @close="showAssess = false"
        @done="onAssessDone"
      />
    </template>

    <p v-else-if="error" class="text-sm text-brand-primary">
      {{ fetchErrorMessage(error) }}
    </p>
    <p v-else-if="pending" class="text-sm text-brand-gray-500">
      …
    </p>
  </div>
</template>