<script setup lang="ts">
/** Canva home page (30)/(31): amenities chips + rental/sell/services bars; square +افزودن. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/equipments')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()

type EquipmentCategory = 'CLUB' | 'RENTAL' | 'SELL' | 'SERVICE'

interface EquipmentItem {
  id: string
  nameFa: string
  nameEn: string
  category: EquipmentCategory
  price: number
  quantity: number
}

const categories: { key: EquipmentCategory; labelKey: string }[] = [
  { key: 'CLUB', labelKey: 'owner.equipmentsPage.amenities' },
  { key: 'RENTAL', labelKey: 'owner.equipmentsPage.rental' },
  { key: 'SELL', labelKey: 'owner.equipmentsPage.sell' },
  { key: 'SERVICE', labelKey: 'owner.equipmentsPage.services' },
]

const grouped = computed(() => ({
  CLUB: data.value?.filter((e: EquipmentItem) => e.category === 'CLUB') || [],
  RENTAL: data.value?.filter((e: EquipmentItem) => e.category === 'RENTAL') || [],
  SELL: data.value?.filter((e: EquipmentItem) => e.category === 'SELL') || [],
  SERVICE: data.value?.filter((e: EquipmentItem) => e.category === 'SERVICE') || [],
}))

const showModal = ref(false)
const editing = ref<EquipmentItem | null>(null)
const modalCategory = ref<EquipmentCategory>('CLUB')
const modalName = ref('')
const modalPrice = ref(0)
const modalQuantity = ref(1)
const saving = ref(false)
const modalError = ref('')
const deleteTarget = ref<EquipmentItem | null>(null)
const deletePending = ref(false)

function formatEquipmentPrice(item: EquipmentItem) {
  if (item.category === 'CLUB' || !item.price) return t('owner.free')
  return formatCurrency(item.price)
}

function formatEquipmentStock(item: EquipmentItem) {
  if (item.category === 'CLUB') return ''
  return t('owner.equipmentsPage.stockLabel', { qty: formatNumber(Math.max(1, item.quantity || 1)) })
}

function openAdd(category: EquipmentCategory) {
  editing.value = null
  modalCategory.value = category
  modalName.value = t('owner.equipmentsPage.newItem')
  modalPrice.value = 0
  modalQuantity.value = 1
  modalError.value = ''
  showModal.value = true
}

function openEdit(item: EquipmentItem) {
  editing.value = item
  modalCategory.value = item.category
  modalName.value = localizedField(item, 'nameFa', 'nameEn')
  modalPrice.value = item.price
  modalQuantity.value = Math.max(1, item.quantity || 1)
  modalError.value = ''
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editing.value = null
  modalError.value = ''
}

async function saveItem() {
  const name = modalName.value.trim()
  if (!name) return
  saving.value = true
  modalError.value = ''
  try {
    const price = modalCategory.value === 'CLUB' ? 0 : Math.max(0, Math.round(modalPrice.value || 0))
    const quantity = modalCategory.value === 'CLUB' ? 1 : Math.max(1, Math.min(999, Math.round(modalQuantity.value || 1)))
    if (editing.value) {
      const body = locale.value === 'fa'
        ? { nameFa: name, price, quantity }
        : { nameEn: name, price, quantity }
      await $fetch(`/api/owner/equipments/${editing.value.id}`, { method: 'PATCH', body })
    } else {
      const body = locale.value === 'fa'
        ? { nameFa: name, nameEn: t('owner.equipmentsPage.newItem'), category: modalCategory.value, price, quantity }
        : { nameEn: name, nameFa: t('owner.equipmentsPage.newItem'), category: modalCategory.value, price, quantity }
      await $fetch('/api/owner/equipments', { method: 'POST', body })
    }
    closeModal()
    await refresh()
  } catch {
    modalError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function requestDelete(item: EquipmentItem) {
  deleteTarget.value = item
}

function closeDelete() {
  if (deletePending.value) return
  deleteTarget.value = null
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deletePending.value = true
  try {
    await $fetch(`/api/owner/equipments/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refresh()
  } catch {
    // silent — user can retry
  } finally {
    deletePending.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.equipments')" />
    <p class="text-sm text-brand-gray-600">{{ t('owner.equipmentsPage.tapToEdit') }}</p>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <div class="canva-equip-wide">
      <section
        v-for="cat in categories"
        :key="cat.key"
        class="space-y-3 border-b border-brand-gray-200 pb-4 last:border-b-0 min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-4 last:min-[431px]:border-b"
        style="border-radius: var(--sz-canva-radius);"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold text-brand-navy">{{ t(cat.labelKey) }}</h2>
          <button type="button" class="canva-equip-add" @click="openAdd(cat.key)">
            {{ t('owner.equipmentsPage.addLink') }}
          </button>
        </div>

        <div v-if="cat.key === 'CLUB'" class="flex flex-wrap gap-2">
          <button
            v-for="e in grouped.CLUB"
            :key="e.id"
            type="button"
            class="canva-equip-chip"
            @click="openEdit(e)"
          >
            {{ localizedField(e, 'nameFa', 'nameEn') }}
          </button>
          <p v-if="!grouped.CLUB.length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</p>
        </div>

        <ul v-else class="space-y-2">
          <li v-for="e in grouped[cat.key]" :key="e.id">
            <button type="button" class="canva-equip-row" @click="openEdit(e)">
              <span class="min-w-0 text-start">
                <span class="font-bold text-brand-navy">{{ localizedField(e, 'nameFa', 'nameEn') }}</span>
                <span v-if="formatEquipmentStock(e)" class="mt-0.5 block text-xs text-brand-gray-600">{{ formatEquipmentStock(e) }}</span>
              </span>
              <span class="shrink-0 text-xs tabular-nums text-brand-gray-600">{{ formatEquipmentPrice(e) }}</span>
            </button>
          </li>
          <li v-if="!grouped[cat.key].length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </section>
      </div>
    </AppAsyncState>

    <OwnerLegalFooter />

    <AppModal
      :open="showModal"
      sheet
      patterned
      :title="editing ? t('owner.equipmentsPage.editTitle') : t('owner.equipmentsPage.addTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeModal"
    >
      <div class="venus-form-stack p-4">
        <AppFormField :label="t('owner.equipmentsPage.itemName')">
          <input v-model="modalName" class="neo-input" :dir="locale === 'fa' ? 'auto' : 'ltr'" />
        </AppFormField>
        <AppFormField v-if="modalCategory !== 'CLUB'" :label="t('owner.equipmentsPage.price')">
          <input v-model.number="modalPrice" type="number" min="0" step="1000" dir="ltr" class="neo-input tabular-nums" />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.equipmentsPage.priceHint') }}</p>
        </AppFormField>
        <AppFormField v-if="modalCategory !== 'CLUB'" :label="t('owner.equipmentsPage.quantity')">
          <input v-model.number="modalQuantity" type="number" min="1" max="999" step="1" dir="ltr" class="neo-input tabular-nums" />
          <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.equipmentsPage.quantityHint') }}</p>
        </AppFormField>
        <p v-if="modalError" class="venus-alert-error">{{ modalError }}</p>
        <button
          type="button"
          class="canva-black-cta"
          :disabled="saving || !modalName.trim()"
          @click="saveItem"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" @click="closeModal">
          {{ t('common.close') }}
        </button>
        <button
          v-if="editing"
          type="button"
          class="text-xs font-bold text-red-600"
          @click="requestDelete(editing); closeModal()"
        >
          {{ t('common.delete') }}
        </button>
      </div>
    </AppModal>

    <CanvaConfirmSheet
      :open="Boolean(deleteTarget)"
      :title="t('common.delete')"
      :body="t('owner.equipmentsPage.confirmDelete')"
      :confirm-label="t('common.delete')"
      :dismiss-label="t('common.close')"
      :pending="deletePending"
      danger
      @confirm="confirmDelete"
      @close="closeDelete"
    />
  </div>
</template>
