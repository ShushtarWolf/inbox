<script setup lang="ts">
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

async function deleteItem(item: EquipmentItem) {
  if (!confirm(t('owner.equipmentsPage.confirmDelete'))) return
  try {
    await $fetch(`/api/owner/equipments/${item.id}`, { method: 'DELETE' })
    await refresh()
  } catch {
    // silent — user can retry
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <h1 class="font-display text-xl font-bold">{{ t('owner.equipments') }}</h1>
    <AppVenusSkeleton v-if="pending" :lines="3" />
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="ios-card p-4"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-bold">{{ t(cat.labelKey) }}</h3>
          <button type="button" class="text-xs font-bold text-brand-primary" @click="openAdd(cat.key)">{{ t('common.add') }}</button>
        </div>
        <ul class="space-y-1 text-sm">
          <li v-for="e in grouped[cat.key]" :key="e.id" class="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-brand-cream/50">
            <span>
              {{ localizedField(e, 'nameFa', 'nameEn') }}
              <span class="text-xs text-brand-gray-600">· {{ formatEquipmentPrice(e) }}</span>
            </span>
            <span class="flex shrink-0 gap-1">
              <button type="button" class="text-xs text-brand-gray-600" @click="openEdit(e)">{{ t('common.edit') }}</button>
              <button type="button" class="text-xs text-red-600" @click="deleteItem(e)">{{ t('common.delete') }}</button>
            </span>
          </li>
          <li v-if="!grouped[cat.key].length" class="text-xs text-brand-gray-600">{{ t('common.empty') }}</li>
        </ul>
      </div>
    </div>

    <AppModal :open="showModal" :title="editing ? t('owner.equipmentsPage.editTitle') : t('owner.equipmentsPage.addTitle')" @close="closeModal">
      <div class="venus-modal-shell venus-modal-shell-simple">
        <div class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <h3 class="font-bold text-brand-navy">{{ editing ? t('owner.equipmentsPage.editTitle') : t('owner.equipmentsPage.addTitle') }}</h3>
          </div>
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
              <button type="button" class="btn-primary flex-1" :disabled="saving || !modalName.trim()" @click="saveItem">
                {{ saving ? t('common.loading') : t('common.save') }}
              </button>
              <button type="button" class="btn-ghost flex-1" @click="closeModal">{{ t('common.close') }}</button>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>
