<script setup lang="ts">
const config = useRuntimeConfig()

const enamadId = computed(() => String(config.public.enamadId || '').trim())
const enamadCode = computed(() => String(config.public.enamadCode || '').trim())
const ready = computed(() => Boolean(enamadId.value && enamadCode.value))

const href = computed(
  () => `https://trustseal.enamad.ir/?id=${encodeURIComponent(enamadId.value)}&Code=${encodeURIComponent(enamadCode.value)}`,
)
const imgSrc = computed(
  () => `https://trustseal.enamad.ir/logo.aspx?id=${encodeURIComponent(enamadId.value)}&Code=${encodeURIComponent(enamadCode.value)}`,
)
</script>

<template>
  <a
    v-if="ready"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    referrerpolicy="origin"
    class="inline-flex items-center justify-center"
    :aria-label="$t('legal.enamad')"
  >
    <img
      :src="imgSrc"
      :alt="$t('legal.enamad')"
      class="h-16 w-16 object-contain"
      referrerpolicy="origin"
      v-bind="{ code: enamadCode }"
    >
  </a>
</template>
