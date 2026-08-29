<script setup lang="ts">
const { formatPhone } = useFormatters()
export type GuestSearchHit = { name: string; mobile: string; source?: string }

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
    class="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto border border-brand-gray-200 bg-white shadow-sm"
    style="border-radius: 2px;"
    role="listbox"
  >
    <p v-if="pending && !suggestions.length" class="px-3 py-2 text-xs text-brand-gray-500">
      {{ $t('common.loading') }}
    </p>
    <button
      v-for="(guest, idx) in suggestions"
      :key="`${guest.mobile}-${guest.name}-${idx}`"
      type="button"
      class="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-brand-primary-soft"
      role="option"
      :aria-selected="idx === 0"
      @mousedown.prevent="emit('select', guest)"
    >
      <span class="min-w-0 truncate font-bold text-brand-navy">{{ guest.name || '—' }}</span>
      <bdi v-if="guest.mobile" dir="ltr" class="shrink-0 tabular-nums text-xs text-brand-gray-600">{{ formatPhone(guest.mobile) }}</bdi>
    </button>
  </div>
</template>
