<script setup lang="ts">
const props = withDefaults(defineProps<{
  pending?: boolean
  error?: boolean | string | null
  empty?: boolean
  loadingLabel?: string
  skeletonLines?: number
  skeletonVariant?: 'default' | 'table' | 'stat-grid' | 'calendar'
  inline?: boolean
}>(), {
  pending: false,
  error: false,
  empty: false,
  loadingLabel: '',
  skeletonLines: 3,
  skeletonVariant: 'default',
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
  <div v-if="pending" :class="inline ? '' : 'tail-page-enter'">
    <slot name="loading">
      <AppVenusCalendarSkeleton v-if="skeletonVariant === 'calendar'" />
      <AppVenusSkeleton
        v-else
        :lines="skeletonLines"
        :variant="skeletonVariant === 'calendar' ? 'default' : skeletonVariant"
      />
      <AppVenusSpinner v-if="inline" size="sm" :label="label" class="mt-4" />
    </slot>
  </div>
  <p v-else-if="errorMessage" class="tail-alert-error">
    {{ errorMessage }}
  </p>
  <p v-else-if="empty" class="tail-card text-sm font-medium text-brand-gray-500">
    <slot name="empty">{{ t('common.empty') }}</slot>
  </p>
  <div v-else class="tail-page-enter">
    <slot />
  </div>
</template>
