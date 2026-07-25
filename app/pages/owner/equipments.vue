<script setup lang="ts">
/** Canva p46: amenities + rental / sell / services sections. */
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
}

const categories: { key: EquipmentCategory; labelKey: string }[] = [
  { key: 'CLUB', labelKey: 'owner.equipmentsPage.club' },
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
const saving = ref(false)
const modalError = ref('')
const deleteTarget = ref<EquipmentItem | null>(null)
const deletePending = ref(false)

function formatEquipmentPrice(item: EquipmentItem) {
  if (item.category === 'CLUB' || !item.price) return t('owner.free')
  return formatCurrency(item.price)
}

function openAdd(category: EquipmentCategory) {
  editing.value = null
  modalCategory.value = category
  modalName.value = t('owner.equipmentsPage.newItem')
  modalPrice.value = 0
  modalError.value = ''
  showModal.value = true
}

function openEdit(item: EquipmentItem) {
  editing.value = item
  modalCategory.value = item.category
  modalName.value = localizedField(item, 'nameFa', 'nameEn')
  modalPrice.value = item.price
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
    if (editing.value) {
      const body = locale.value === 'fa'
        ? { nameFa: name, price }
        : { nameEn: name, price }
      await $fetch(`/api/owner/equipments/${editing.value.id}`, { method: 'PATCH', body })
    } else {
      const body = locale.value === 'fa'
        ? { nameFa: name, nameEn: t('owner.equipmentsPage.newItem'), category: modalCategory.value, price }
        : { nameEn: name, nameFa: t('owner.equipmentsPage.newItem'), category: modalCategory.value, price }
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
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
      <h1 class="canva-page-hero-title">{{ t('owner.equipments') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('owner.equipmentsPage.subtitle') }}</p>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <!-- Amenities (CLUB) as chips — Canva p46 -->
      <section class="canva-panel space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold text-brand-navy">{{ t('owner.equipmentsPage.amenities') }}</h2>
          <button type="button" class="text-xs font-bold text-brand-primary" @click="openAdd('CLUB')">{{ t('common.add') }}</button>
        </div>
        <div v-if="grouped.CLUB.length" class="flex flex-wrap gap-2">
          <button
            v-for="e in grouped.CLUB"
            :key="e.id"
            type="button"
            class="canva-court-chip canva-court-chip-idle"
            @click="openEdit(e)"
          >
            {{ localizedField(e, 'nameFa', 'nameEn') }}
          </button>
        </div>
        <p v-else class="text-xs text-brand-gray-600">{{ t('common.empty') }}</p>
      </section>

      <section
        v-for="cat in categories.filter((c) => c.key !== 'CLUB')"
        :key="cat.key"
        class="canva-panel space-y-3"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-bold text-brand-navy">{{ t(cat.labelKey) }}</h2>
          <button type="button" class="text-xs font-bold text-brand-primary" @click="openAdd(cat.key)">{{ t('common.add') }}</button>
        </div>
        <ul class="space-y-1 text-sm">
          <li
            v-for="e in grouped[cat.key]"
            :key="e.id"
            class="flex items-center justify-between gap-2 rounded-lg px-1 py-2 hover:bg-brand-cream/80"
          >
            <span>
              {{ localizedField(e, 'nameFa', 'nameEn') }}
              <span class="text-xs text-brand-gray-600">· {{ formatEquipmentPrice(e) }}</span>
            </span>
            <span class="flex shrink-0 gap-2">
              <button type="button" class="text-xs text-brand-gray-600" @click="openEdit(e)">{{ t('common.edit') }}</button>
              <button type="button" class="text-xs text-red-600" @click="requestDelete(e)">{{ t('common.delete') }}</button>
            </span>
          </li>
          <li v-if="!grouped[cat.key].length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </section>
    </AppAsyncState>

    <OwnerLegalFooter />

    <AppModal :open="showModal" patterned :title="editing ? t('owner.equipmentsPage.editTitle') : t('owner.equipmentsPage.addTitle')" @close="closeModal">
      <div class="venus-modal-shell venus-modal-shell-simple">
        <div class="venus-modal-panel">
          <div class="venus-modal-panel-body venus-form-stack">
            <label class="block text-sm">
              <span class="mb-1 block font-bold text-brand-gray-600">{{ t('owner.equipmentsPage.itemName') }}</span>
              <input v-model="modalName" class="neo-input" :dir="locale === 'fa' ? 'auto' : 'ltr'">
            </label>
            <label v-if="modalCategory !== 'CLUB'" class="block text-sm">
              <span class="mb-1 block font-bold text-brand-gray-600">{{ t('owner.equipmentsPage.price') }}</span>
              <input v-model.number="modalPrice" type="number" min="0" step="1000" dir="ltr" class="neo-input tabular-nums">
              <span class="mt-1 block text-xs text-brand-gray-600">{{ t('owner.equipmentsPage.priceHint') }}</span>
            </label>
          </div>
          <div class="venus-modal-footer">
            <p v-if="modalError" class="venus-alert-error">{{ modalError }}</p>
            <div class="flex gap-3">
              <button type="button" class="canva-gate-canva-gate-btn-primary flex-1" :disabled="saving || !modalName.trim()" @click="saveItem">
                {{ saving ? t('common.loading') : t('common.save') }}
              </button>
              <button type="button" class="btn-ghost flex-1" @click="closeModal">{{ t('common.close') }}</button>
            </div>
          </div>
        </div>
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
