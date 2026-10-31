<script setup lang="ts">
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'

definePageMeta({
  layout: 'dashboard-athlete',
  middleware: ['auth', 'role'],
  role: 'ATHLETE',
  ssr: false,
})

const route = useRoute()
const { t } = useI18n()
const { formatNumber } = useFormatters()
const { localizedField } = useLocalizedField()

const slug = computed(() => String(route.params.slug || '').trim())

type Program = {
  id: string
  titleFa: string
  titleEn: string | null
  percent: number
  instructionsFa: string | null
  instructionsEn: string | null
  verificationKind: string
}

type Eligibility = {
  programs: Program[]
  membership: { programId: string; percent: number; labelFa: string } | null
  applicationByProgramId: Record<string, { status: string; rejectReason: string | null }>
}

const clubPending = ref(true)
const clubError = ref<unknown>(null)
const clubName = ref('')
const clubId = ref('')

const eligibility = ref<Eligibility | null>(null)
const eligibilityPending = ref(true)

const studentProgram = computed(() =>
  (eligibility.value?.programs || []).find((p) => p.verificationKind === 'STUDENT') || null,
)

const applicationStatus = computed(() => {
  const prog = studentProgram.value
  if (!prog) return null
  if (eligibility.value?.membership?.programId === prog.id) return 'APPROVED'
  return eligibility.value?.applicationByProgramId?.[prog.id]?.status || null
})

const backTo = computed(() =>
  slug.value === PILOT_CLUB_SLUG
    ? `/clubs/${slug.value}`
    : '/athlete',
)

async function loadClub() {
  clubPending.value = true
  clubError.value = null
  try {
    const club = await $fetch<{ id: string; nameFa: string; nameEn?: string | null }>(
      `/api/clubs/${encodeURIComponent(slug.value)}`,
    )
    clubId.value = club.id
    clubName.value = club.nameFa
  }
  catch (err) {
    clubError.value = err
  }
  finally {
    clubPending.value = false
  }
}

async function loadEligibility() {
  if (!clubId.value) return
  eligibilityPending.value = true
  try {
    eligibility.value = await $fetch<Eligibility>('/api/discounts/eligibility', {
      query: { clubId: clubId.value },
    })
  }
  catch {
    eligibility.value = null
  }
  finally {
    eligibilityPending.value = false
  }
}

watch(slug, () => { loadClub() }, { immediate: true })
watch(clubId, () => { loadEligibility() })

async function onSubmitted() {
  await loadEligibility()
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader
      :to="backTo"
      :title="t('studentVerify.pageTitle')"
      :subtitle="t('studentVerify.pageSubtitle')"
    />

    <AppAsyncState :pending="clubPending || eligibilityPending" :error="clubError" skeleton-variant="default">
      <section
        class="space-y-4 text-start min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-5"
        style="border-radius: var(--sz-canva-radius);"
      >
        <div>
          <p class="text-xs font-bold text-brand-gray-500">{{ t('studentVerify.sectionActivation') }}</p>
          <h2 class="mt-1 text-base font-bold text-brand-navy">
            {{ clubName }}
            <span v-if="studentProgram" class="text-brand-primary">
              — {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(studentProgram.percent) }) }}
            </span>
          </h2>
          <p
            v-if="studentProgram && localizedField(studentProgram, 'instructionsFa', 'instructionsEn')"
            class="mt-2 text-sm text-brand-gray-600"
          >
            {{ localizedField(studentProgram, 'instructionsFa', 'instructionsEn') }}
          </p>
        </div>

        <StudentIdentityVerificationForm
          v-if="studentProgram"
          :program-id="studentProgram.id"
          :program-percent="studentProgram.percent"
          :initial-status="applicationStatus"
          :disabled="!studentProgram"
          @submitted="onSubmitted"
        />

        <p v-else class="text-sm text-brand-gray-600">
          {{ t('studentVerify.noProgram') }}
        </p>

        <div class="border-t border-[rgba(44,44,42,.08)] pt-4">
          <h3 class="text-sm font-bold text-brand-navy">{{ t('studentVerify.antifraudTitle') }}</h3>
          <ul class="mt-2 list-disc space-y-1 ps-5 text-xs text-brand-gray-600">
            <li>{{ t('studentVerify.antifraudItem1') }}</li>
            <li>{{ t('studentVerify.antifraudItem2') }}</li>
            <li>{{ t('studentVerify.antifraudItem3') }}</li>
          </ul>
        </div>
      </section>
    </AppAsyncState>
  </div>
</template>
