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
  <div class="flex min-h-dvh items-center justify-center bg-brand-cream px-4 py-16">
    <div class="canva-result-sheet w-full max-w-sm p-6 text-center">
      <div class="relative z-[1] space-y-3">
        <img
          src="/brand/inbox-logo-lockup.png"
          alt="inbox"
          class="canva-error-brand"
        />
        <p class="text-5xl font-bold text-brand-primary">{{ error.statusCode || 500 }}</p>
        <h1 class="text-xl font-bold text-brand-navy">{{ title }}</h1>
        <p class="text-sm text-brand-gray-600">{{ message }}</p>
        <p class="text-xs font-bold text-brand-gray-400">inbox · inboxs.ir</p>
        <button type="button" class="btn-primary mt-4 w-full" @click="goHome">{{ t('errors.goHome') }}</button>
      </div>
    </div>
  </div>
</template>
