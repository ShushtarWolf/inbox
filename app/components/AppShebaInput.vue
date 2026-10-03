<script setup lang="ts">
import { extractAsciiDigits } from '#shared/digits.ts'

defineOptions({ inheritAttrs: false })

/** v-model is full SHEBA (`IR` + 24 digits) or empty. UI shows digits only with locked IR prefix. */
const model = defineModel<string>({ default: '' })

defineProps<{
  id?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}>()

const digits = computed({
  get() {
    return extractAsciiDigits(model.value || '').slice(0, 24)
  },
  set(value: string) {
    const next = extractAsciiDigits(value).slice(0, 24)
    model.value = next ? `IR${next}` : ''
  },
})
</script>

<template>
  <div
    class="neo-input flex items-center gap-1.5 font-mono text-sm tabular-nums focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2"
    :class="invalid ? 'ring-2 ring-red-500' : ''"
    style="outline-color: var(--brand-primary, #173f5f)"
    dir="ltr"
  >
    <span class="shrink-0 select-none font-bold text-brand-navy">IR</span>
    <input
      :id="id"
      v-bind="$attrs"
      v-model="digits"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      maxlength="24"
      spellcheck="false"
      :disabled="disabled"
      :placeholder="placeholder"
      class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-brand-navy outline-none"
      :aria-invalid="invalid || undefined"
    >
  </div>
</template>
