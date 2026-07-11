<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

const { t } = useI18n()

const title = computed(() => {
  if (props.error.statusCode === 404) return t('errors.notFoundTitle')
  return t('errors.genericTitle')
})

const message = computed(() => {
  if (props.error.statusCode === 404) return t('errors.notFoundBody')
  return props.error.statusMessage || props.error.message || t('errors.genericBody')
})

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
    <p class="text-6xl font-bold text-brand-red">{{ error.statusCode || 500 }}</p>
    <h1 class="mt-4 text-xl font-bold text-brand-navy">{{ title }}</h1>
    <p class="mt-2 text-brand-muted">{{ message }}</p>
    <button type="button" class="btn-primary mt-8" @click="goHome">{{ t('errors.goHome') }}</button>
  </div>
</template>
