<script setup lang="ts">
import { normalizeDiscountCode, clampDiscountPercent } from '#shared/discountCode.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const { formatNumber, formatPhone } = useFormatters()
const { localizedField } = useLocalizedField()

type Tab = 'codes' | 'programs' | 'requests' | 'members'
const tab = ref<Tab>('programs')

interface DiscountRow {
  id: string
  code: string
  labelFa: string | null
  labelEn: string | null
  percent: number
  active: boolean
  maxRedemptions: number | null
  redemptionCount: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
}

interface ProgramRow {
  id: string
  titleFa: string
  titleEn: string | null
  percent: number
  instructionsFa: string | null
  instructionsEn: string | null
  validityMonths: number | null
  active: boolean
  _count?: { applications: number; memberships: number }
}

interface ApplicationRow {
  id: string
  status: string
  note: string | null
  rejectReason: string | null
  proofUrls: string[]
  fullName: string | null
  studentNumber: string | null
  ownershipConfirmed: boolean
  createdAt: string
  user: { id: string; name: string; phone: string | null }
  program: {
    id: string
    titleFa: string
    titleEn: string | null
    percent: number
    verificationKind: string
  }
}

interface MemberRow {
  id: string
  percent: number
  labelFa: string
  labelEn: string | null
  approvedAt: string
  expiresAt: string | null
  user: { id: string; name: string; phone: string | null }
  program: { id: string; titleFa: string; titleEn: string | null; active: boolean }
}

const { data, pending, error, refresh } = await useAuthedFetch<DiscountRow[]>('/api/owner/discounts')
const {
  data: programs,
  pending: programsPending,
  error: programsError,
  refresh: refreshPrograms,
} = await useAuthedFetch<ProgramRow[]>('/api/owner/discount-programs')
const {
  data: applications,
  pending: appsPending,
  error: appsError,
  refresh: refreshApps,
} = await useAuthedFetch<ApplicationRow[]>('/api/owner/discount-applications?status=PENDING')
const {
  data: members,
  pending: membersPending,
  error: membersError,
  refresh: refreshMembers,
} = await useAuthedFetch<MemberRow[]>('/api/owner/discount-memberships')

async function refreshAll() {
  await Promise.all([refresh(), refreshPrograms(), refreshApps(), refreshMembers()])
}
useOwnerClubRefresh(refreshAll)

const showModal = ref(false)
const editing = ref<DiscountRow | null>(null)
const modalCode = ref('')
const modalLabel = ref('')
const modalPercent = ref(20)
const modalMaxRedemptions = ref<number | null>(null)
const modalEndsAt = ref('')
const modalActive = ref(true)
const saving = ref(false)
const modalError = ref('')

const showProgramModal = ref(false)
const editingProgram = ref<ProgramRow | null>(null)
const programTitle = ref('')
const programPercent = ref(20)
const programInstructions = ref('')
const programValidityMonths = ref<number | null>(null)
const programActive = ref(true)
const programSaving = ref(false)
const programError = ref('')

const reviewApp = ref<ApplicationRow | null>(null)
const rejectReason = ref('')
const reviewing = ref(false)
const reviewError = ref('')
const proofPreview = ref<string | null>(null)

const pendingCount = computed(() => (applications.value || []).length)

function rowLabel(row: DiscountRow) {
  if (locale.value === 'fa') return row.labelFa || row.labelEn || ''
  return row.labelEn || row.labelFa || ''
}

function usageLabel(row: DiscountRow) {
  if (row.maxRedemptions == null) {
    return t('owner.discountsPage.usageUnlimited', { used: formatNumber(row.redemptionCount) })
  }
  return t('owner.discountsPage.usageLimited', {
    used: formatNumber(row.redemptionCount),
    max: formatNumber(row.maxRedemptions),
  })
}

function openAdd() {
  editing.value = null
  modalCode.value = ''
  modalLabel.value = ''
  modalPercent.value = 20
  modalMaxRedemptions.value = null
  modalEndsAt.value = ''
  modalActive.value = true
  modalError.value = ''
  showModal.value = true
}

function openEdit(row: DiscountRow) {
  editing.value = row
  modalCode.value = row.code
  modalLabel.value = rowLabel(row)
  modalPercent.value = row.percent
  modalMaxRedemptions.value = row.maxRedemptions
  modalEndsAt.value = row.endsAt ? row.endsAt.slice(0, 10) : ''
  modalActive.value = row.active
  modalError.value = ''
  showModal.value = true
}

function closeModal() {
  if (saving.value) return
  showModal.value = false
  editing.value = null
  modalError.value = ''
}

function statusMessageFromError(err: unknown) {
  const statusMessage = typeof err === 'object' && err && 'data' in err
    ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
    : undefined
  if (statusMessage === 'Discount code already exists') return t('owner.discountsPage.errorDuplicate')
  if (statusMessage?.includes('3–32') || statusMessage?.includes('3-32')) {
    return t('owner.discountsPage.errorCodeFormat')
  }
  if (statusMessage?.includes('Percent')) return t('owner.discountsPage.errorPercent')
  return t('common.error')
}

async function saveItem() {
  const percent = clampDiscountPercent(Number(modalPercent.value))
  if (percent < 1) {
    modalError.value = t('owner.discountsPage.errorPercent')
    return
  }
  if (!editing.value) {
    const code = normalizeDiscountCode(modalCode.value)
    if (!/^[A-Z0-9]{3,32}$/.test(code)) {
      modalError.value = t('owner.discountsPage.errorCodeFormat')
      return
    }
  }
  saving.value = true
  modalError.value = ''
  try {
    const label = modalLabel.value.trim() || null
    const maxRaw = modalMaxRedemptions.value
    const maxRedemptions = maxRaw == null || Number(maxRaw) <= 0
      ? null
      : Math.round(Number(maxRaw))
    const endsAt = modalEndsAt.value.trim() || null

    if (editing.value) {
      await $fetch(`/api/owner/discounts/${editing.value.id}`, {
        method: 'PATCH',
        body: {
          percent,
          ...(locale.value === 'fa' ? { labelFa: label } : { labelEn: label }),
          maxRedemptions,
          endsAt,
          active: modalActive.value,
        },
      })
    }
    else {
      await $fetch('/api/owner/discounts', {
        method: 'POST',
        body: {
          code: normalizeDiscountCode(modalCode.value),
          percent,
          labelFa: label,
          labelEn: label,
          maxRedemptions,
          endsAt,
          active: true,
        },
      })
    }
    saving.value = false
    closeModal()
    await refresh()
  }
  catch (err) {
    modalError.value = statusMessageFromError(err)
  }
  finally {
    saving.value = false
  }
}

function openAddProgram() {
  editingProgram.value = null
  programTitle.value = ''
  programPercent.value = 20
  programInstructions.value = ''
  programValidityMonths.value = null
  programActive.value = true
  programError.value = ''
  showProgramModal.value = true
}

function openEditProgram(row: ProgramRow) {
  editingProgram.value = row
  programTitle.value = localizedField(row, 'titleFa', 'titleEn') || row.titleFa
  programPercent.value = row.percent
  programInstructions.value = localizedField(row, 'instructionsFa', 'instructionsEn') || ''
  programValidityMonths.value = row.validityMonths
  programActive.value = row.active
  programError.value = ''
  showProgramModal.value = true
}

function closeProgramModal() {
  if (programSaving.value) return
  showProgramModal.value = false
  editingProgram.value = null
  programError.value = ''
}

async function saveProgram() {
  const title = programTitle.value.trim()
  const percent = clampDiscountPercent(Number(programPercent.value))
  if (title.length < 2) {
    programError.value = t('owner.discountsPage.programTitleRequired')
    return
  }
  if (percent < 1) {
    programError.value = t('owner.discountsPage.errorPercent')
    return
  }
  programSaving.value = true
  programError.value = ''
  try {
    const validityRaw = programValidityMonths.value
    const validityMonths = validityRaw == null || Number(validityRaw) <= 0
      ? null
      : Math.round(Number(validityRaw))
    const body = {
      titleFa: title,
      titleEn: title,
      percent,
      instructionsFa: programInstructions.value.trim() || null,
      instructionsEn: programInstructions.value.trim() || null,
      validityMonths,
      active: programActive.value,
    }
    if (editingProgram.value) {
      await $fetch(`/api/owner/discount-programs/${editingProgram.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $fetch('/api/owner/discount-programs', { method: 'POST', body })
    }
    programSaving.value = false
    closeProgramModal()
    await refreshPrograms()
  }
  catch {
    programError.value = t('common.error')
  }
  finally {
    programSaving.value = false
  }
}

function openReview(app: ApplicationRow) {
  reviewApp.value = app
  rejectReason.value = ''
  reviewError.value = ''
}

function closeReview() {
  if (reviewing.value) return
  reviewApp.value = null
  reviewError.value = ''
}

async function review(action: 'approve' | 'reject') {
  if (!reviewApp.value || reviewing.value) return
  reviewing.value = true
  reviewError.value = ''
  try {
    await $fetch(`/api/owner/discount-applications/${reviewApp.value.id}/review`, {
      method: 'POST',
      body: {
        action,
        reason: action === 'reject' ? rejectReason.value.trim() || null : null,
      },
    })
    reviewing.value = false
    closeReview()
    await Promise.all([refreshApps(), refreshMembers(), refreshPrograms()])
  }
  catch {
    reviewError.value = t('common.error')
  }
  finally {
    reviewing.value = false
  }
}

async function revokeMember(row: MemberRow) {
  if (!confirm(t('owner.discountsPage.revokeConfirm', { name: row.user.name }))) return
  try {
    await $fetch(`/api/owner/discount-memberships/${row.id}/revoke`, { method: 'POST' })
    await refreshMembers()
  }
  catch {
    // ignore — list refresh will show truth
  }
}
</script>

<template>
  <div class="venus-page-stack owner-discount-page">
    <CanvaSubpageHeader
      to="/owner/calendar?more=1"
      :title="t('owner.discounts')"
      :subtitle="t('owner.discountsPage.subtitleVerified')"
    />
    <OwnerActiveClubBar class="mb-3" />

    <div class="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="canva-chip text-xs"
        :class="tab === 'programs' ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="tab = 'programs'"
      >
        {{ t('owner.discountsPage.tabPrograms') }}
      </button>
      <button
        type="button"
        class="canva-chip text-xs"
        :class="tab === 'requests' ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="tab = 'requests'"
      >
        {{ t('owner.discountsPage.tabRequests') }}
        <span v-if="pendingCount" class="ms-1 tabular-nums">({{ formatNumber(pendingCount) }})</span>
      </button>
      <button
        type="button"
        class="canva-chip text-xs"
        :class="tab === 'members' ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="tab = 'members'"
      >
        {{ t('owner.discountsPage.tabMembers') }}
      </button>
      <button
        type="button"
        class="canva-chip text-xs"
        :class="tab === 'codes' ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="tab = 'codes'"
      >
        {{ t('owner.discountsPage.tabCodes') }}
      </button>
    </div>

    <!-- Programs -->
    <template v-if="tab === 'programs'">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-brand-gray-600">{{ t('owner.discountsPage.programsHint') }}</p>
        <button type="button" class="canva-equip-add" @click="openAddProgram">
          {{ t('owner.discountsPage.addLink') }}
        </button>
      </div>
      <AppAsyncState :pending="programsPending" :error="programsError" skeleton-variant="table">
        <ul class="space-y-2">
          <li v-for="row in programs || []" :key="row.id">
            <button type="button" class="canva-equip-row w-full" @click="openEditProgram(row)">
              <span class="min-w-0 text-start">
                <span class="font-bold text-brand-navy">{{ localizedField(row, 'titleFa', 'titleEn') || row.titleFa }}</span>
                <span class="mt-0.5 block text-xs text-brand-gray-600">
                  {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(row.percent) }) }}
                  | {{ t('owner.discountsPage.pendingShort', { n: formatNumber(row._count?.applications || 0) }) }}
                  | {{ t('owner.discountsPage.membersShort', { n: formatNumber(row._count?.memberships || 0) }) }}
                </span>
              </span>
              <span
                class="shrink-0 text-xs font-bold"
                :class="row.active ? 'text-emerald-700' : 'text-brand-gray-500'"
              >
                {{ row.active ? t('owner.discountsPage.active') : t('owner.discountsPage.inactive') }}
              </span>
            </button>
          </li>
          <li v-if="!(programs || []).length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </AppAsyncState>
    </template>

    <!-- Requests -->
    <template v-else-if="tab === 'requests'">
      <p class="mb-2 text-xs text-brand-gray-600">{{ t('owner.discountsPage.requestsHint') }}</p>
      <AppAsyncState :pending="appsPending" :error="appsError" skeleton-variant="table">
        <ul class="space-y-2">
          <li v-for="app in applications || []" :key="app.id">
            <button type="button" class="canva-equip-row w-full" @click="openReview(app)">
              <span class="min-w-0 text-start">
                <span class="font-bold text-brand-navy">{{ app.fullName || app.user.name }}</span>
                <span class="mt-0.5 block text-xs text-brand-gray-600">
                  {{ localizedField(app.program, 'titleFa', 'titleEn') || app.program.titleFa }}
                  | {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(app.program.percent) }) }}
                </span>
                <span
                  v-if="app.studentNumber"
                  class="mt-0.5 block text-xs text-brand-gray-500 tabular-nums"
                >
                  <bdi dir="ltr">{{ app.studentNumber }}</bdi>
                </span>
                <span v-if="app.user.phone" class="mt-0.5 block text-xs text-brand-gray-500" dir="ltr">
                  <bdi dir="ltr">{{ formatPhone(app.user.phone) }}</bdi>
                </span>
              </span>
              <span class="shrink-0 text-xs font-bold text-amber-700">{{ t('owner.discountsPage.statusPending') }}</span>
            </button>
          </li>
          <li v-if="!(applications || []).length" class="text-xs text-brand-gray-600">{{ t('owner.discountsPage.noPending') }}</li>
        </ul>
      </AppAsyncState>
    </template>

    <!-- Members -->
    <template v-else-if="tab === 'members'">
      <p class="mb-2 text-xs text-brand-gray-600">{{ t('owner.discountsPage.membersHint') }}</p>
      <AppAsyncState :pending="membersPending" :error="membersError" skeleton-variant="table">
        <ul class="space-y-2">
          <li v-for="row in members || []" :key="row.id" class="canva-equip-row">
            <span class="min-w-0 text-start">
              <span class="font-bold text-brand-navy">{{ row.user.name }}</span>
              <span class="mt-0.5 block text-xs text-brand-gray-600">
                {{ row.labelFa }} | {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(row.percent) }) }}
              </span>
            </span>
            <button type="button" class="shrink-0 text-xs font-bold text-brand-primary" @click="revokeMember(row)">
              {{ t('owner.discountsPage.revoke') }}
            </button>
          </li>
          <li v-if="!(members || []).length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </AppAsyncState>
    </template>

    <!-- Promo codes (existing) -->
    <template v-else>
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-brand-gray-600">{{ t('owner.discountsPage.tapToEdit') }}</p>
        <button type="button" class="canva-equip-add" @click="openAdd">
          {{ t('owner.discountsPage.addLink') }}
        </button>
      </div>
      <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
        <ul class="space-y-2">
          <li v-for="row in data || []" :key="row.id">
            <button type="button" class="canva-equip-row w-full" @click="openEdit(row)">
              <span class="min-w-0 text-start">
                <span class="font-bold text-brand-navy" dir="ltr">{{ row.code }}</span>
                <span class="mt-0.5 block text-xs text-brand-gray-600">
                  {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(row.percent) }) }}
                  | {{ usageLabel(row) }}
                </span>
                <span v-if="rowLabel(row)" class="mt-0.5 block text-xs text-brand-gray-500">{{ rowLabel(row) }}</span>
              </span>
              <span
                class="shrink-0 text-xs font-bold"
                :class="row.active ? 'text-emerald-700' : 'text-brand-gray-500'"
              >
                {{ row.active ? t('owner.discountsPage.active') : t('owner.discountsPage.inactive') }}
              </span>
            </button>
          </li>
          <li v-if="!(data || []).length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </AppAsyncState>
    </template>

    <OwnerLegalFooter />

    <!-- Code modal -->
    <AppModal
      :open="showModal"
      sheet
      patterned
      :title="editing ? t('owner.discountsPage.editTitle') : t('owner.discountsPage.addTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeModal"
    >
      <div class="venus-form-stack p-4">
        <AppFormField :label="t('owner.discountsPage.code')">
          <input
            v-model="modalCode"
            class="neo-input"
            dir="ltr"
            autocomplete="off"
            :disabled="Boolean(editing)"
            :placeholder="t('owner.discountsPage.codePlaceholder')"
          >
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.codeHint') }}</p>
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.label')">
          <input v-model="modalLabel" class="neo-input" :dir="locale === 'fa' ? 'auto' : 'ltr'">
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.percent')" numeric>
          <AppNumericInput v-model="modalPercent" :min="1" :max="100" />
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.maxRedemptions')" numeric>
          <AppNumericInput
            v-model="modalMaxRedemptions"
            :min="1"
            :placeholder="t('owner.discountsPage.maxRedemptionsPlaceholder')"
          />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.maxRedemptionsHint') }}</p>
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.endsAt')">
          <AppDateInput v-model="modalEndsAt" :show-formatted-hint="false" />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.endsAtHint') }}</p>
        </AppFormField>
        <label v-if="editing" class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="modalActive" type="checkbox" class="size-4 accent-brand-primary">
          {{ t('owner.discountsPage.active') }}
        </label>
        <p v-if="modalError" class="venus-alert-error">{{ modalError }}</p>
        <button
          type="button"
          class="canva-black-cta"
          :disabled="saving || (!editing && !modalCode.trim())"
          @click="saveItem"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="saving" @click="closeModal">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>

    <!-- Program modal -->
    <AppModal
      :open="showProgramModal"
      sheet
      patterned
      :title="editingProgram ? t('owner.discountsPage.editProgramTitle') : t('owner.discountsPage.addProgramTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeProgramModal"
    >
      <div class="venus-form-stack p-4">
        <AppFormField :label="t('owner.discountsPage.programTitle')">
          <input
            v-model="programTitle"
            class="neo-input"
            :placeholder="t('owner.discountsPage.programTitlePlaceholder')"
          >
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.percent')" numeric>
          <AppNumericInput v-model="programPercent" :min="1" :max="100" />
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.programInstructions')">
          <textarea
            v-model="programInstructions"
            class="neo-input min-h-20"
            :placeholder="t('owner.discountsPage.programInstructionsPlaceholder')"
          />
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.validityMonths')" numeric>
          <AppNumericInput
            v-model="programValidityMonths"
            :min="1"
            :placeholder="t('owner.discountsPage.validityMonthsPlaceholder')"
          />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.validityMonthsHint') }}</p>
        </AppFormField>
        <label v-if="editingProgram" class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="programActive" type="checkbox" class="size-4 accent-brand-primary">
          {{ t('owner.discountsPage.active') }}
        </label>
        <p v-if="programError" class="venus-alert-error">{{ programError }}</p>
        <button
          type="button"
          class="canva-black-cta"
          :disabled="programSaving || !programTitle.trim()"
          @click="saveProgram"
        >
          {{ programSaving ? t('common.loading') : t('common.save') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="programSaving" @click="closeProgramModal">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>

    <!-- Review modal -->
    <AppModal
      :open="Boolean(reviewApp)"
      sheet
      patterned
      :title="t('owner.discountsPage.reviewTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeReview"
    >
      <div v-if="reviewApp" class="venus-form-stack space-y-3 p-4 text-start">
        <p class="font-bold text-brand-navy">
          {{ reviewApp.fullName || reviewApp.user.name }}
        </p>
        <p v-if="reviewApp.studentNumber" class="text-xs text-brand-gray-600">
          {{ t('studentVerify.studentNumber') }}:
          <bdi dir="ltr" class="tabular-nums">{{ reviewApp.studentNumber }}</bdi>
        </p>
        <p v-if="reviewApp.user.phone" class="text-xs text-brand-gray-600">
          {{ formatPhone(reviewApp.user.phone) }}
        </p>
        <p class="text-xs text-brand-gray-600">
          {{ localizedField(reviewApp.program, 'titleFa', 'titleEn') || reviewApp.program.titleFa }}
          | {{ t('owner.discountsPage.percentLabel', { percent: formatNumber(reviewApp.program.percent) }) }}
        </p>
        <p v-if="reviewApp.note" class="text-sm text-brand-navy">{{ reviewApp.note }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="url in reviewApp.proofUrls"
            :key="url"
            type="button"
            class="border border-[rgba(44,44,42,.08)]"
            @click="proofPreview = url"
          >
            <img :src="url" alt="" class="h-24 w-24 object-cover">
          </button>
        </div>
        <AppFormField :label="t('owner.discountsPage.rejectReason')">
          <input v-model="rejectReason" class="neo-input" :placeholder="t('owner.discountsPage.rejectReasonPlaceholder')">
        </AppFormField>
        <p v-if="reviewError" class="venus-alert-error">{{ reviewError }}</p>
        <button type="button" class="canva-black-cta" :disabled="reviewing" @click="review('approve')">
          {{ reviewing ? t('common.loading') : t('owner.discountsPage.approve') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="reviewing" @click="review('reject')">
          {{ t('owner.discountsPage.reject') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="reviewing" @click="closeReview">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>

    <AppModal
      :open="Boolean(proofPreview)"
      :title="t('owner.discountsPage.proofPreview')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="proofPreview = null"
    >
      <div class="p-4">
        <img v-if="proofPreview" :src="proofPreview" alt="" class="mx-auto max-h-[70vh] w-full object-contain">
      </div>
    </AppModal>
  </div>
</template>
