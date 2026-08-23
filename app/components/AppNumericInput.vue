<script setup lang="ts">
import { extractAsciiDigits } from '#shared/digits.ts'

const model = defineModel<number | null>({ default: null })

const props = withDefaults(defineProps<{
  min?: number
  max?: number
  id?: string
  placeholder?: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const display = ref('')

watch(() => model.value, (value) => {
  const next = value == null || Number.isNaN(value) ? '' : String(value)
  if (next !== display.value) display.value = next
}, { immediate: true })

function clamp(value: number): number {
  let n = value
  if (props.min != null && n < props.min) n = props.min
  if (props.max != null && n > props.max) n = props.max
  return n
}

function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  const digits = extractAsciiDigits(el.value)
  el.value = digits
  display.value = digits

  if (!digits) {
    model.value = null
    return
  }
  model.value = clamp(Number(digits))
}

function onBlur() {
  if (model.value != null && !Number.isNaN(model.value)) {
    model.value = clamp(model.value)
    display.value = String(model.value)
  }
}
</script>

<template>
  <input
    :id="id"
    :value="display"
    type="text"
    inputmode="numeric"
    dir="ltr"
    :placeholder="placeholder"
    :disabled="disabled"
    class="neo-input tabular-nums"
    @input="onInput"
    @blur="onBlur"
  >
</template>
