<script setup lang="ts">
const props = defineProps<{
  clubId: string
}>()

const { t } = useI18n()
const { formatNumber } = useFormatters()
const { localizedField } = useLocalizedField()
const { user } = useAuth()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

type Program = {
  id: string
  titleFa: string
  titleEn: string | null
  percent: number
  instructionsFa: string | null
  instructionsEn: string | null
  validityMonths: number | null
}

type Eligibility = {
  programs: Program[]
  membership: {
    id: string
    programId: string
    percent: number
    labelFa: string
    labelEn: string | null
    code: string
    expiresAt: string | null
  } | null
  applicationByProgramId: Record<string, {
    id: string
    status: string
    rejectReason: string | null
  }>
}

const eligibility = ref<Eligibility | null>(null)
const loading = ref(false)
const applyProgram = ref<Program | null>(null)
const proofUrls = ref<string[]>([])
const note = ref('')
const submitting = ref(false)
const formError = ref('')
const proofSlot = ref(0)

async function load() {
  if (!props.clubId) return
  loading.value = true
  try {
    eligibility.value = await $fetch<Eligibility>('/api/discounts/eligibility', {
      query: { clubId: props.clubId },
    })
  }
  catch {
    eligibility.value = null
  }
  finally {
    loading.value = false
  }
}

watch(() => props.clubId, () => { load() }, { immediate: true })
watch(user, () => { load() })

const programs = computed(() => eligibility.value?.programs || [])
const membership = computed(() => eligibility.value?.membership || null)
const visible = computed(() => programs.value.length > 0 || Boolean(membership.value))

function statusFor(programId: string) {
  return eligibility.value?.applicationByProgramId?.[programId]?.status || null
}

function openApply(program: Program) {
  if (!user.value) {
    openLogin()
    return
  }
  applyProgram.value = program
  proofUrls.value = []
  note.value = ''
  formError.value = ''
  proofSlot.value = 0
}

function closeApply() {
  if (submitting.value) return
  applyProgram.value = null
  formError.value = ''
}

function onProof(url: string) {
  if (!url) return
  const next = [...proofUrls.value]
  if (proofSlot.value === 0) next[0] = url
  else next[1] = url
  proofUrls.value = next.filter(Boolean).slice(0, 2)
}

async function submitApply() {
  if (!applyProgram.value || submitting.value) return
  if (!proofUrls.value.length) {
    formError.value = t('clubs.discountProofRequired')
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    await $fetch('/api/discount-applications', {
      method: 'POST',
      body: {
        programId: applyProgram.value.id,
        proofUrls: proofUrls.value,
        note: note.value.trim() || null,
      },
    })
    submitting.value = false
    closeApply()
    await load()
  }
  catch (err) {
    formError.value = fetchErrorMessage(err, t('common.error'))
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <section v-if="visible && !loading" class="canva-club-detail-section text-start">
    <h2 class="canva-club-detail-section-title">{{ t('clubs.discountProgramsTitle') }}</h2>

    <p
      v-if="membership"
      class="mb-2 text-sm font-bold text-emerald-800"
      role="status"
    >
      {{ t('clubs.discountActive', {
        label: membership.labelFa,
        percent: formatNumber(membership.percent),
      }) }}
    </p>

    <ul class="space-y-2">
      <li
        v-for="program in programs"
        :key="program.id"
        class="border border-[rgba(44,44,42,.08)] bg-white p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="font-bold text-brand-navy">
              {{ localizedField(program, 'titleFa', 'titleEn') || program.titleFa }}
              | {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(program.percent) }) }}
            </p>
            <p
              v-if="localizedField(program, 'instructionsFa', 'instructionsEn')"
              class="mt-1 text-xs text-brand-gray-600"
            >
              {{ localizedField(program, 'instructionsFa', 'instructionsEn') }}
            </p>
            <p v-if="statusFor(program.id) === 'PENDING'" class="mt-1 text-xs font-bold text-amber-700">
              {{ t('clubs.discountPending') }}
            </p>
            <p v-else-if="statusFor(program.id) === 'REJECTED'" class="mt-1 text-xs text-brand-primary">
              {{ t('clubs.discountRejected') }}
            </p>
            <p
              v-else-if="membership?.programId === program.id"
              class="mt-1 text-xs font-bold text-emerald-700"
            >
              {{ t('clubs.discountApproved') }}
            </p>
          </div>
          <button
            v-if="membership?.programId !== program.id && statusFor(program.id) !== 'PENDING'"
            type="button"
            class="shrink-0 text-xs font-bold text-brand-primary"
            @click="openApply(program)"
          >
            {{ statusFor(program.id) === 'REJECTED' ? t('clubs.discountReapply') : t('clubs.discountApplyCta') }}
          </button>
        </div>
      </li>
    </ul>

    <AppModal
      :open="Boolean(applyProgram)"
      sheet
      patterned
      :title="t('clubs.discountApplyTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeApply"
    >
      <div v-if="applyProgram" class="venus-form-stack space-y-3 p-4 text-start">
        <p class="text-sm text-brand-navy">
          {{ localizedField(applyProgram, 'titleFa', 'titleEn') || applyProgram.titleFa }}
          | {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(applyProgram.percent) }) }}
        </p>
        <p
          v-if="localizedField(applyProgram, 'instructionsFa', 'instructionsEn')"
          class="text-xs text-brand-gray-600"
        >
          {{ localizedField(applyProgram, 'instructionsFa', 'instructionsEn') }}
        </p>

        <AppImageUpload
          :model-value="proofUrls[0] || ''"
          :label="t('clubs.discountProof1')"
          @update:model-value="(url) => { proofSlot = 0; onProof(url) }"
        />
        <AppImageUpload
          :model-value="proofUrls[1] || ''"
          :label="t('clubs.discountProof2')"
          @update:model-value="(url) => { proofSlot = 1; onProof(url) }"
        />

        <AppFormField :label="t('clubs.discountNote')">
          <input v-model="note" class="neo-input" :placeholder="t('clubs.discountNotePlaceholder')">
        </AppFormField>

        <p v-if="formError" class="venus-alert-error">{{ formError }}</p>
        <button
          type="button"
          class="canva-black-cta"
          :disabled="submitting || !proofUrls.length"
          @click="submitApply"
        >
          {{ submitting ? t('common.loading') : t('clubs.discountSubmit') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="submitting" @click="closeApply">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>
  </section>
</template>
