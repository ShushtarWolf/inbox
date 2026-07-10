<script setup lang="ts">
const props = withDefaults(defineProps<{
  pending?: boolean
  error?: boolean | string | null
  empty?: boolean
  loadingLabel?: string
  skeletonLines?: number
  inline?: boolean
}>(), {
  pending: false,
  error: false,
  empty: false,
  loadingLabel: '',
  skeletonLines: 3,
  inline: false,
})

const { t } = useI18n()

const errorMessage = computed(() => {
  if (typeof props.error === 'string') return props.error
  if (props.error) return t('common.error')
  return ''
})

const label = computed(() => props.loadingLabel || t('common.loading'))
</script>

<template>
  <div v-if="pending" :class="inline ? '' : 'venus-page-enter'">
    <slot name="loading">
      <AppVenusSkeleton :lines="skeletonLines" />
      <AppVenusSpinner v-if="inline" size="sm" :label="label" class="mt-4" />
    </slot>
  </div>
  <p v-else-if="errorMessage" class="rounded-venus border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
    {{ errorMessage }}
  </p>
  <p v-else-if="empty" class="ios-card p-5 text-sm font-semibold text-brand-gray-600">
    <slot name="empty">{{ t('common.empty') }}</slot>
  </p>
  <div v-else class="venus-page-enter">
    <slot />
  </div>
</template>
