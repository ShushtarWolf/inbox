<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { formatFaDigits } = useFormatters()
const { openMatchEnabled } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()

const clubSlug = computed(() => String(route.query.club || 'padel-zone-tehran'))

const { data: clubData, pending } = useFetch<{
  courts: Array<{
    id: string
    nameFa: string
    sportId: string
    sport?: { id: string, nameFa: string }
  }>
  nextSlots: Array<{
    id: string
    startTime: string
    endTime: string
    courtNameFa: string
  }>
}>(`/api/clubs/${clubSlug.value}`, { immediate: openMatchEnabled.value, lazy: true })

const form = reactive({
  slotId: '',
  sportId: '',
  paymentMode: 'SPLIT_ONLINE' as 'HOST_PAYS' | 'SPLIT_ONLINE',
  matchType: 'FRIENDLY' as 'FRIENDLY' | 'COMPETITIVE',
  maxPlayers: 4,
  minLevel: 3,
  maxLevel: 5,
  note: '',
})

const courtByName = computed(() => {
  const map = new Map<string, { id: string, sportId: string }>()
  for (const c of clubData.value?.courts || []) {
    map.set(c.nameFa, { id: c.id, sportId: c.sport?.id || c.sportId })
  }
  return map
})

const slots = computed(() => {
  return (clubData.value?.nextSlots || []).map((s) => {
    const court = courtByName.value.get(s.courtNameFa)
    return {
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      courtName: s.courtNameFa,
      sportId: court?.sportId || '',
      date: '',
    }
  })
})

watch(slots, (list) => {
  if (!form.slotId && list[0]) {
    form.slotId = list[0].id
    form.sportId = list[0].sportId
  }
}, { immediate: true })

watch(() => form.slotId, (id) => {
  const row = slots.value.find((s) => s.id === id)
  if (row) form.sportId = row.sportId
})

const actionError = ref('')
const actionPending = ref(false)

async function publish() {
  actionError.value = ''
  actionPending.value = true
  try {
    const result = await $fetch<{ openMatch: { id: string } }>('/api/open-matches', {
      method: 'POST',
      body: { ...form },
    })
    await navigateTo(localePath(`/athlete/open-match/${result.openMatch.id}`))
  } catch (err) {
    actionError.value = fetchErrorMessage(err)
  } finally {
    actionPending.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <CanvaSubpageHeader :to="localePath('/athlete/open-match')" :title="t('openMatch.createTitle')" />

    <section v-if="pending" class="text-sm text-silver">
      …
    </section>

    <form v-else class="space-y-4 border border-brand-gray-200 bg-white p-4" @submit.prevent="publish">
      <label class="block text-sm">
        {{ t('openMatch.selectSlot') }}
        <select v-model="form.slotId" class="mt-1 w-full border border-brand-gray-200 p-2 bg-white text-sm" dir="rtl">
          <option v-for="s in slots" :key="s.id" :value="s.id">
            {{ s.courtName }} —
            <bdi dir="ltr">{{ s.date }} {{ s.startTime }}</bdi>
          </option>
        </select>
      </label>

      <label class="block text-sm">
        {{ t('openMatch.selectPaymentMode') }}
        <select v-model="form.paymentMode" class="mt-1 w-full border border-brand-gray-200 p-2 bg-white text-sm">
          <option value="HOST_PAYS">
            {{ t('openMatch.paymentHost') }}
          </option>
          <option value="SPLIT_ONLINE">
            {{ t('openMatch.paymentSplit') }}
          </option>
        </select>
      </label>

      <label class="block text-sm">
        {{ t('openMatch.matchType') }}
        <select v-model="form.matchType" class="mt-1 w-full border border-brand-gray-200 p-2 bg-white text-sm">
          <option value="FRIENDLY">
            {{ t('openMatch.friendly') }}
          </option>
          <option value="COMPETITIVE">
            {{ t('openMatch.competitive') }}
          </option>
        </select>
      </label>

      <label class="block text-sm">
        {{ t('openMatch.maxPlayersLabel') }}
        <input v-model.number="form.maxPlayers" type="number" min="2" max="8" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm">
          {{ t('openMatch.minLevelLabel') }}
          <input v-model.number="form.minLevel" type="number" min="1" max="7" step="0.1" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
        </label>
        <label class="block text-sm">
          {{ t('openMatch.maxLevelLabel') }}
          <input v-model.number="form.maxLevel" type="number" min="1" max="7" step="0.1" class="mt-1 w-full border border-brand-gray-200 p-2" dir="ltr">
        </label>
      </div>

      <label class="block text-sm">
        یادداشت
        <textarea v-model="form.note" rows="2" class="mt-1 w-full border border-brand-gray-200 p-2 text-sm" />
      </label>

      <p v-if="actionError" class="text-sm text-crimson">
        {{ actionError }}
      </p>

      <button
        type="submit"
        class="w-full bg-brand-primary py-2 text-sm font-medium text-white disabled:opacity-50"
        :disabled="actionPending || !form.slotId"
      >
        {{ t('openMatch.publishMatch') }}
      </button>
    </form>
  </div>
</template>