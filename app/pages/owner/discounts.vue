<script setup lang="ts">
import { normalizeDiscountCode, clampDiscountPercent } from '#shared/discountCode.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch<DiscountRow[]>('/api/owner/discounts')
useOwnerClubRefresh(refresh)
const { formatNumber } = useFormatters()

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
    } else {
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
    closeModal()
    await refresh()
  } catch (err) {
    modalError.value = statusMessageFromError(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.discounts')" />
    <p class="text-sm text-brand-gray-600">{{ t('owner.discountsPage.subtitle') }}</p>

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
                · {{ usageLabel(row) }}
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

    <OwnerLegalFooter />

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
          />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.codeHint') }}</p>
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.label')">
          <input v-model="modalLabel" class="neo-input" :dir="locale === 'fa' ? 'auto' : 'ltr'" />
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.percent')" numeric>
          <input
            v-model.number="modalPercent"
            type="number"
            min="1"
            max="100"
            step="1"
            dir="ltr"
            class="neo-input tabular-nums"
          />
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.maxRedemptions')" numeric>
          <input
            v-model.number="modalMaxRedemptions"
            type="number"
            min="1"
            step="1"
            dir="ltr"
            class="neo-input tabular-nums"
            :placeholder="t('owner.discountsPage.maxRedemptionsPlaceholder')"
          />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.maxRedemptionsHint') }}</p>
        </AppFormField>
        <AppFormField :label="t('owner.discountsPage.endsAt')">
          <input v-model="modalEndsAt" type="date" dir="ltr" class="neo-input" />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.discountsPage.endsAtHint') }}</p>
        </AppFormField>
        <label v-if="editing" class="flex items-center gap-2 text-sm font-bold text-brand-navy">
          <input v-model="modalActive" type="checkbox" class="size-4 accent-brand-primary" />
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
  </div>
</template>
