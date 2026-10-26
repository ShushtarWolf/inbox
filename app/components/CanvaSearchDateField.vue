<script setup lang="ts">
/**
 * Home search-bar date field (design `rsf rsfd`): calendar icon trailing the label,
 * Jalali calendar in an anchored popover on wide screens (design `rpop rcalp`) and in the
 * existing bottom sheet on phones. Both pages share the field so the ids used by e2e stay stable.
 */
const model = defineModel<string>({ required: true })

defineProps<{
  id: string
  label: string
  sheetTitle: string
}>()

const open = ref(false)
const popover = ref(false)
const root = ref<HTMLElement | null>(null)

/** Phones (≤430px) keep the AppModal sheet; anything wider anchors the popover under the field. */
const DESKTOP_QUERY = '(min-width: 431px)'
let mql: MediaQueryList | null = null
function syncMode() {
  popover.value = Boolean(mql?.matches)
}

function toggle() {
  if (open.value) {
    open.value = false
    return
  }
  // Defer open so the tap paints first (helps INP on mid-tier phones).
  requestAnimationFrame(() => {
    open.value = true
  })
}

function onPicked() {
  open.value = false
}

function onPointerDown(event: PointerEvent) {
  if (!open.value || !popover.value) return
  if (root.value && event.target instanceof Node && root.value.contains(event.target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value && popover.value) open.value = false
}

onMounted(() => {
  mql = window.matchMedia(DESKTOP_QUERY)
  syncMode()
  mql.addEventListener('change', syncMode)
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', syncMode)
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="canva-search-field canva-search-field-date">
    <label class="sr-only" :for="id">{{ label }}</label>
    <button
      :id="id"
      type="button"
      class="canva-search-placeholder canva-search-date-btn"
      :class="{ 'canva-search-placeholder-filled': model }"
      :aria-expanded="open && popover ? 'true' : 'false'"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <span class="truncate">
        <slot />
      </span>
      <AppIcon name="calendar_month" size="sm" class="canva-search-field-icon" />
    </button>

    <Transition name="canva-search-popover">
      <div
        v-if="open && popover"
        class="canva-search-popover"
        role="dialog"
        :aria-label="sheetTitle"
      >
        <AppJalaliCalendar v-model="model" @select="onPicked" />
      </div>
    </Transition>

    <AppModal
      :open="open && !popover"
      sheet
      patterned
      :title="sheetTitle"
      max-width-class="canva-phone-shell max-w-sm"
      @close="open = false"
    >
      <div class="px-4 pb-5 pt-2">
        <AppJalaliCalendar v-model="model" @select="onPicked" />
      </div>
    </AppModal>
  </div>
</template>
