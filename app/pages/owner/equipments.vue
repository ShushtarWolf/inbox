<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t, locale } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/equipments')
useOwnerClubRefresh(refresh)
const { localizedField } = useLocalizedField()

type EquipmentCategory = 'CLUB' | 'RENTAL' | 'SELL' | 'SERVICE'

interface EquipmentItem {
  id: string
  nameFa: string
  nameEn: string
  category: EquipmentCategory
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
const saving = ref(false)
const modalError = ref('')

function openAdd(category: EquipmentCategory) {
  editing.value = null
  modalCategory.value = category
  modalName.value = t('owner.equipmentsPage.newItem')
  modalError.value = ''
  showModal.value = true
}

function openEdit(item: EquipmentItem) {
  editing.value = item
  modalCategory.value = item.category
  modalName.value = localizedField(item, 'nameFa', 'nameEn')
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
    if (editing.value) {
      const body = locale.value === 'fa'
        ? { nameFa: name }
        : { nameEn: name }
      await $fetch(`/api/owner/equipments/${editing.value.id}`, { method: 'PATCH', body })
    } else {
      const body = locale.value === 'fa'
        ? { nameFa: name, nameEn: t('owner.equipmentsPage.newItem'), category: modalCategory.value }
        : { nameEn: name, nameFa: t('owner.equipmentsPage.newItem'), category: modalCategory.value }
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
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ t('owner.equipments') }}</h1>
    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="rounded-xl border bg-white p-4"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h3 class="font-bold">{{ t(cat.labelKey) }}</h3>
          <button type="button" class="text-xs font-bold text-brand-primary" @click="openAdd(cat.key)">{{ t('common.add') }}</button>
        </div>
        <ul class="space-y-1 text-sm">
          <li v-for="e in grouped[cat.key]" :key="e.id" class="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-brand-cream/50">
            <span>{{ localizedField(e, 'nameFa', 'nameEn') }}</span>
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
      <div class="rounded-2xl bg-white p-4">
        <label class="mb-3 block text-sm">
          <span class="mb-1 block font-bold">{{ t('owner.equipmentsPage.itemName') }}</span>
          <input v-model="modalName" class="w-full rounded-xl border px-3 py-2" :dir="locale === 'fa' ? 'auto' : 'ltr'">
        </label>
        <p v-if="modalError" class="mb-2 text-sm text-red-600">{{ modalError }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn-primary flex-1" :disabled="saving || !modalName.trim()" @click="saveItem">
            {{ saving ? t('common.loading') : t('common.save') }}
          </button>
          <button type="button" class="btn-ghost flex-1" @click="closeModal">{{ t('common.close') }}</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
