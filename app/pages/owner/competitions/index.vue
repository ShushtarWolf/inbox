<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const { formatNumber, formatCurrency, formatIsoDate } = useFormatters()
const { user } = useAuth()
const { competitionsVisibleForClub } = usePilotFlags()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })

const activeClubSlug = computed(() => {
  const memberships = user.value?.memberships || []
  const membership = memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
  return membership?.club?.slug
})
const competitionsAvailable = computed(() => competitionsVisibleForClub(activeClubSlug.value))

interface CompetitionRow {
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
  sport: { id: string; nameFa: string; nameEn: string }
}

interface CourtRow {
  id: string
  sportId: string
  sport: { id: string; nameFa: string; nameEn: string }
}

const { data, pending, error, refresh } = await useAuthedFetch<CompetitionRow[]>('/api/owner/competitions', {
  immediate: competitionsAvailable.value,
})
const { data: courtsData } = await useAuthedFetch<CourtRow[]>('/api/owner/courts')
useOwnerClubRefresh(refresh)

const showModal = ref(false)
const saving = ref(false)
const modalError = ref('')
const calendarWarning = ref<{ overlappingSlots: number; date: string; time: string } | null>(null)

const modalTitle = ref('')
const modalFormat = ref('knockout')
const modalSportId = ref('')
const modalEnrollmentType = ref<'SINGLE' | 'DOUBLE'>('SINGLE')
const modalEntryFee = ref(0)
const modalSponsorFunded = ref(false)
const modalMaxParticipants = ref(8)
const modalMinParticipants = ref(2)
const modalRegistrationOpens = ref('')
const modalRegistrationCloses = ref('')
const modalEventAt = ref('')
const modalPrizeType = ref<'WALLET' | 'DISCOUNT'>('WALLET')
const modalPrizeAmount = ref(500000)
const modalPrizePercent = ref(20)
const modalPublish = ref(false)
const modalAnnounce = ref(false)

const sports = computed(() => {
  const map = new Map<string, { id: string; label: string }>()
  for (const court of courtsData.value || []) {
    if (!map.has(court.sportId)) {
      const label = locale.value === 'fa' ? court.sport.nameFa : court.sport.nameEn
      map.set(court.sportId, { id: court.sportId, label })
    }
  }
  return [...map.values()]
})

function sportLabel(row: CompetitionRow) {
  return locale.value === 'fa' ? row.sport.nameFa : row.sport.nameEn
}

function statusLabel(status: string) {
  return t(`owner.competitionsPage.status.${status}` as 'owner.competitionsPage.status.DRAFT')
}

function openAdd() {
  modalTitle.value = ''
  modalFormat.value = 'knockout'
  modalSportId.value = sports.value[0]?.id || ''
  modalEnrollmentType.value = 'SINGLE'
  modalEntryFee.value = 0
  modalSponsorFunded.value = false
  modalMaxParticipants.value = 8
  modalMinParticipants.value = 2
  modalRegistrationOpens.value = ''
  modalRegistrationCloses.value = ''
  modalEventAt.value = ''
  modalPrizeType.value = 'WALLET'
  modalPrizeAmount.value = 500000
  modalPrizePercent.value = 20
  modalPublish.value = false
  modalAnnounce.value = false
  modalError.value = ''
  calendarWarning.value = null
  showModal.value = true
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
  modalError.value = ''
  calendarWarning.value = null
}

function prizeConfigJson() {
  if (modalPrizeType.value === 'WALLET') {
    return JSON.stringify({ placements: [{ placement: 1, amount: modalPrizeAmount.value }] })
  }
  return JSON.stringify({ placements: [{ placement: 1, percent: modalPrizePercent.value }] })
}

function statusMessageFromError(err: unknown) {
  const statusMessage = typeof err === 'object' && err && 'data' in err
    ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
    : undefined
  if (statusMessage === 'NO_COURTS_FOR_SPORT') return t('owner.competitionsPage.errorNoCourts')
  if (statusMessage === 'ENTRY_FEE_LOCKED') return t('owner.competitionsPage.errorEntryFeeLocked')
  if (statusMessage === 'ENTRY_FEE_TOO_HIGH') return t('owner.competitionsPage.errorEntryFeeTooHigh')
  if (statusMessage === 'MAX_BELOW_CONFIRMED') return t('owner.competitionsPage.errorMaxBelowConfirmed')
  return t('common.error')
}

async function saveItem() {
  if (!modalTitle.value.trim() || !modalSportId.value) {
    modalError.value = t('common.required')
    return
  }
  saving.value = true
  modalError.value = ''
  calendarWarning.value = null
  try {
    const result = await $fetch<{
      competition: { id: string }
      calendarWarning: { overlappingSlots: number; date: string; time: string } | null
    }>('/api/owner/competitions', {
      method: 'POST',
      body: {
        sportId: modalSportId.value,
        title: modalTitle.value.trim(),
        format: modalFormat.value.trim(),
        enrollmentType: modalEnrollmentType.value,
        entryFee: modalEntryFee.value,
        sponsorFunded: modalSponsorFunded.value,
        maxParticipants: modalMaxParticipants.value,
        minParticipants: modalMinParticipants.value,
        registrationOpens: modalRegistrationOpens.value,
        registrationCloses: modalRegistrationCloses.value,
        eventAt: modalEventAt.value,
        prizeType: modalPrizeType.value,
        prizeConfigJson: prizeConfigJson(),
        publish: modalPublish.value,
        announce: modalAnnounce.value,
      },
    })
    if (result.calendarWarning) {
      calendarWarning.value = result.calendarWarning
    }
    closeModal()
    await refresh()
    await router.push(localePath(`/owner/competitions/${result.competition.id}`))
  } catch (err) {
    modalError.value = statusMessageFromError(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.competitions')" />

    <CanvaEmptyState
      v-if="!competitionsAvailable"
      :title="t('competitions.comingSoon')"
      icon="emoji_events"
    />

    <template v-else>
    <p class="text-sm text-brand-gray-600">{{ t('owner.competitionsPage.subtitle') }}</p>

    <div class="flex items-center justify-between gap-2">
      <p class="text-xs text-brand-gray-600">{{ t('common.detail') }}</p>
      <button type="button" class="canva-equip-add" @click="openAdd">
        {{ t('owner.competitionsPage.addLink') }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <ul class="space-y-2">
        <li v-for="row in data || []" :key="row.id">
          <NuxtLink :to="localePath(`/owner/competitions/${row.id}`)" class="canva-equip-row block w-full">
            <span class="min-w-0 text-start">
              <span class="font-bold text-brand-navy">{{ row.title }}</span>
              <span class="mt-0.5 block text-xs text-brand-gray-600">
                {{ sportLabel(row) }} · {{ row.format }}
                · {{ formatCurrency(row.entryFee) }}
              </span>
              <span class="mt-0.5 block text-xs text-brand-gray-500">
                <bdi dir="ltr" class="tabular-nums">{{ formatIsoDate(row.eventAt) }}</bdi>
                · {{ formatNumber(row.confirmedCount) }}/{{ formatNumber(row.maxParticipants) }}
              </span>
            </span>
            <span class="shrink-0 text-xs font-bold text-brand-navy">{{ statusLabel(row.status) }}</span>
          </NuxtLink>
        </li>
        <li v-if="!(data || []).length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
      </ul>
    </AppAsyncState>

    <OwnerLegalFooter />

    <AppModal
      :open="showModal"
      sheet
      patterned
      :title="t('owner.competitionsPage.addTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeModal"
    >
      <div class="venus-form-stack p-4">
        <AppFormField :label="t('owner.competitionsPage.title')">
          <input v-model="modalTitle" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.format')">
          <input v-model="modalFormat" class="neo-input" :placeholder="t('owner.competitionsPage.formatPlaceholder')" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.sport')">
          <select v-model="modalSportId" class="neo-input">
            <option v-for="sport in sports" :key="sport.id" :value="sport.id">{{ sport.label }}</option>
          </select>
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.enrollmentType')">
          <select v-model="modalEnrollmentType" class="neo-input">
            <option value="SINGLE">{{ t('owner.competitionsPage.enrollmentSingle') }}</option>
            <option value="DOUBLE">{{ t('owner.competitionsPage.enrollmentDouble') }}</option>
          </select>
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.entryFee')" numeric>
          <AppNumericInput v-model="modalEntryFee" :min="0" />
        </AppFormField>
        <label v-if="modalEntryFee <= 0" class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="modalSponsorFunded" type="checkbox" class="size-4 accent-brand-primary" />
          {{ t('owner.competitionsPage.sponsorFunded') }}
        </label>
        <p v-if="modalEntryFee <= 0" class="text-xs text-brand-gray-600">{{ t('owner.competitionsPage.sponsorFundedHint') }}</p>
        <AppFormField :label="t('owner.competitionsPage.maxParticipants')" numeric>
          <AppNumericInput v-model="modalMaxParticipants" :min="1" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.minParticipants')" numeric>
          <AppNumericInput v-model="modalMinParticipants" :min="1" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.registrationOpens')">
          <input v-model="modalRegistrationOpens" type="datetime-local" dir="ltr" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.registrationCloses')">
          <input v-model="modalRegistrationCloses" type="datetime-local" dir="ltr" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.eventAt')">
          <input v-model="modalEventAt" type="datetime-local" dir="ltr" class="neo-input" />
        </AppFormField>
        <AppFormField :label="t('owner.competitionsPage.prizeType')">
          <select v-model="modalPrizeType" class="neo-input">
            <option value="WALLET">{{ t('owner.competitionsPage.prizeWallet') }}</option>
            <option value="DISCOUNT">{{ t('owner.competitionsPage.prizeDiscount') }}</option>
          </select>
        </AppFormField>
        <AppFormField
          v-if="modalPrizeType === 'WALLET'"
          :label="t('owner.competitionsPage.prizeAmount')"
          numeric
        >
          <AppNumericInput v-model="modalPrizeAmount" :min="1" />
        </AppFormField>
        <AppFormField
          v-else
          :label="t('owner.competitionsPage.prizePercent')"
          numeric
        >
          <AppNumericInput v-model="modalPrizePercent" :min="1" :max="100" />
        </AppFormField>
        <label class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="modalPublish" type="checkbox" class="size-4 accent-brand-primary" />
          {{ t('owner.competitionsPage.publish') }}
        </label>
        <label class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="modalAnnounce" type="checkbox" class="size-4 accent-brand-primary" :disabled="!modalPublish" />
          {{ t('owner.competitionsPage.announce') }}
        </label>
        <p class="text-xs text-brand-gray-600">{{ t('owner.competitionsPage.announceHint') }}</p>
        <p v-if="calendarWarning" class="venus-alert-warning text-sm">
          {{ t('owner.competitionsPage.calendarWarning', {
            count: calendarWarning.overlappingSlots,
            date: calendarWarning.date,
            time: calendarWarning.time,
          }) }}
        </p>
        <p v-if="modalError" class="venus-alert-error">{{ modalError }}</p>
        <button type="button" class="canva-black-cta" :disabled="saving" @click="saveItem">
          {{ saving ? t('common.loading') : t('owner.competitionsPage.saveDraft') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="saving" @click="closeModal">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>
    </template>
  </div>
</template>
