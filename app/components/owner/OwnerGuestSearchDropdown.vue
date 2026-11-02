<script setup lang="ts">
const { formatPhone } = useFormatters()
import type { GuestSearchHit } from '#shared/guestSearch.ts'

export type { GuestSearchHit }

defineProps<{
  open: boolean
  pending: boolean
  suggestions: GuestSearchHit[]
  listId: string
}>()

const emit = defineEmits<{
  select: [guest: GuestSearchHit]
}>()
</script>

<template>
  <div
    v-if="open && (suggestions.length || pending)"
    :id="listId"
    class="owner-guest-search-dropdown absolute start-0 top-full z-20 mt-1 max-h-56 overflow-y-auto border border-brand-gray-200 bg-white shadow-md"
    role="listbox"
  >
    <div v-if="pending && !suggestions.length" class="flex justify-center px-3 py-3">
      <AppVenusSpinner size="sm" compact />
    </div>
    <button
      v-for="(guest, idx) in suggestions"
      :key="`${guest.mobile}-${guest.name}-${idx}`"
      type="button"
      class="flex w-full flex-col items-stretch gap-0.5 border-b border-brand-gray-100 px-3 py-2.5 text-start last:border-b-0 hover:bg-brand-primary-soft"
      role="option"
      :aria-selected="idx === 0"
      @mousedown.prevent="emit('select', guest)"
    >
      <span class="w-full text-sm font-bold leading-snug text-brand-navy">{{ guest.name || '—' }}</span>
      <bdi v-if="guest.mobile" dir="ltr" class="w-full text-start text-xs tabular-nums text-brand-gray-600">{{ formatPhone(guest.mobile) }}</bdi>
    </button>
  </div>
</template>

<style scoped>
.owner-guest-search-dropdown {
  min-width: min(100%, 22rem);
  width: max(100%, 18rem);
  max-width: min(calc(100vw - 2rem), 26rem);
  border-radius: 0;
}
</style>
