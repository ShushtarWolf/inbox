<script setup lang="ts">
import { palette } from '#shared/palette.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const date = ref(new Date().toISOString().slice(0, 10))
const selectedSlot = ref<any>(null)
const showMenu = ref(false)
const showReserve = ref(false)

const form = reactive({
  guestName: '',
  guestFamily: '',
  guestMobile: '',
  paymentMethod: 'CASH',
  comments: '',
})

const { data, refresh } = await useAuthedFetch('/api/owner/calendar', {
  query: computed(() => ({ date: date.value })),
})

const hours = computed(() => {
  const set = new Set<string>()
  data.value?.slots?.forEach((s: { startTime: string }) => set.add(s.startTime))
  return [...set].sort()
})

function slotClass(status: string) {
  const map: Record<string, string> = {
    FREE: 'slot-free',
    RESERVED: 'slot-reserved',
    PUBLIC: 'slot-public',
    TEAM: 'slot-team',
    PENDING: 'slot-pending',
    CANCELLED: 'slot-cancel',
    CLOSED: 'slot-closed',
  }
  return map[status] || 'slot-free'
}

function statusLabel(status: string) {
  return t(`owner.status.${status}`)
}

function cellSlot(courtId: string, hour: string) {
  return data.value?.slots?.find((s: { courtId: string; startTime: string }) => s.courtId === courtId && s.startTime === hour)
}

function openSlot(slot: any) {
  selectedSlot.value = slot
  showMenu.value = true
  if (slot.booking) {
    form.guestName = slot.booking.guestName || ''
    form.guestFamily = slot.booking.guestFamily || ''
    form.guestMobile = slot.booking.guestMobile || ''
  }
}

async function doReserve() {
  await $fetch('/api/owner/reserve', {
    method: 'POST',
    body: { slotId: selectedSlot.value.id, ...form, displayStatus: 'RESERVED' },
  })
  showReserve.value = false
  showMenu.value = false
  refresh()
}

async function doCancel() {
  await $fetch('/api/owner/cancel', { method: 'POST', body: { slotId: selectedSlot.value.id } })
  showMenu.value = false
  refresh()
}

const legend = [
  { status: 'TEAM', color: palette.slotDisplay.TEAM },
  { status: 'PUBLIC', color: palette.slotDisplay.PUBLIC },
  { status: 'RESERVED', color: palette.slotDisplay.RESERVED },
  { status: 'FREE', color: palette.slotDisplay.FREE },
  { status: 'CANCELLED', color: palette.slotDisplay.CANCELLED },
  { status: 'PENDING', color: palette.slotDisplay.PENDING },
  { status: 'CLOSED', color: palette.slotDisplay.CLOSED },
]
</script>

<template>
  <div>
    <header class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="font-display text-xl font-black">{{ t('owner.calendar') }}</h1>
        <p class="text-sm text-brand-gray-600">{{ t('owner.shape') }} — {{ date }}</p>
      </div>
      <input v-model="date" type="date" class="rounded-lg border px-2 py-1 text-sm" />
    </header>

    <div class="flex flex-wrap gap-6">
      <div class="min-w-0 flex-1 overflow-x-auto rounded-xl border bg-white p-3 shadow-card">
        <table class="w-full border-collapse text-center text-xs">
          <thead>
            <tr>
              <th class="border p-2">{{ t('owner.hour') }}</th>
              <th v-for="c in data?.courts" :key="c.id" class="border p-2">{{ localizedField(c, 'nameFa', 'nameEn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in hours" :key="h">
              <td class="border bg-brand-cream p-2 font-bold">{{ h.slice(0, 2) }}</td>
              <td v-for="c in data?.courts" :key="c.id" class="border p-1">
                <button
                  v-if="cellSlot(c.id, h)"
                  type="button"
                  class="slot w-full rounded px-1 py-2 text-[10px] font-bold"
                  :class="slotClass(cellSlot(c.id, h)!.displayStatus)"
                  @click="openSlot(cellSlot(c.id, h))"
                >
                  {{ cellSlot(c.id, h)!.displayStatus === 'FREE' ? t('owner.free') : '•' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside class="w-44 shrink-0 rounded-xl border bg-white p-3 shadow-card">
        <h3 class="mb-2 text-sm font-bold">{{ t('owner.legend') }}</h3>
        <div v-for="item in legend" :key="item.status" class="mb-1 flex items-center gap-2 text-xs">
          <span class="h-3 w-3 rounded" :style="{ background: item.color }" />
          {{ statusLabel(item.status) }}
        </div>
      </aside>
    </div>

    <div v-if="showMenu" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showMenu = false">
      <div class="flex max-w-2xl flex-wrap gap-4">
        <div class="w-48 rounded-xl bg-white shadow-lg">
          <button type="button" class="block w-full border-b px-4 py-3 text-start text-sm font-bold" @click="doCancel">{{ t('owner.cancel') }}</button>
          <button type="button" class="block w-full border-b bg-brand-primary px-4 py-3 text-start text-sm font-bold text-white" @click="showReserve = true">{{ t('owner.reserve') }}</button>
          <NuxtLink :to="localePath('/owner/reserve/season')" class="block w-full border-b px-4 py-3 text-sm font-bold">{{ t('owner.seasonReserve') }}</NuxtLink>
          <NuxtLink :to="localePath('/owner/reserve/package')" class="block w-full border-b px-4 py-3 text-sm font-bold">{{ t('owner.reserveWithCoach') }}</NuxtLink>
          <button type="button" class="block w-full px-4 py-3 text-start text-sm" @click="showMenu = false">{{ t('common.close') }}</button>
        </div>

        <div v-if="showReserve" class="w-80 rounded-xl bg-white p-4 shadow-lg">
          <h3 class="mb-3 font-bold">{{ t('owner.reserve') }}</h3>
          <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm" />
          <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm" />
          <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm" />
          <select v-model="form.paymentMethod" class="mb-2 w-full rounded border px-2 py-1.5 text-sm">
            <option value="IPG">{{ t('owner.paymentMethods.IPG') }}</option>
            <option value="CASH">{{ t('owner.paymentMethods.CASH') }}</option>
            <option value="PAID">{{ t('owner.paymentMethods.PAID') }}</option>
            <option value="NOT_PAID">{{ t('owner.paymentMethods.NOT_PAID') }}</option>
          </select>
          <textarea v-model="form.comments" :placeholder="t('owner.comments')" class="mb-3 w-full rounded border px-2 py-1.5 text-sm" rows="2" />
          <button type="button" class="btn-primary w-full" @click="doReserve">{{ t('owner.reserve') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slot { cursor: pointer; }
</style>
