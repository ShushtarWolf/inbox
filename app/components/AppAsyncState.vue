<script setup lang="ts">
const props = withDefaults(defineProps<{
  pending?: boolean
  /** Accept Error objects from useFetch/useAsyncData without callers wrapping. */
  error?: boolean | string | Error | null
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
  if (props.error instanceof Error) return props.error.message || t('common.error')
  if (props.error) return t('common.error')
  return ''
})

const label = computed(() => props.loadingLabel || t('common.loading'))

/**
 * After the default slot has rendered once with real content, keep it mounted
 * during soft refreshes (pending flips true). Avoids skeleton↔content height
 * cliffs that drive Clarity CLS on /coaches, athlete home, owner calendar, etc.
 */
const retainContent = ref(false)

watch(
  () => [props.pending, props.error, props.empty] as const,
  ([pending, error, empty]) => {
    if (!pending && !error && !empty) {
      retainContent.value = true
      return
    }
    if (!pending && empty) {
      retainContent.value = false
    }
  },
  { immediate: true },
)

const showSkeleton = computed(() => props.pending && !retainContent.value)
const showContent = computed(() => {
  if (errorMessage.value) return false
  if (showSkeleton.value) return false
  if (props.empty && !props.pending) return false
  return true
})
</script>

<template>
  <div v-if="showSkeleton" :class="inline ? '' : 'tail-page-enter'">
    <slot name="loading">
      <AppVenusCalendarSkeleton v-if="skeletonVariant === 'calendar'" />
      <AppVenusSkeleton
        v-else
        :lines="skeletonLines"
        :variant="skeletonVariant === 'table' || skeletonVariant === 'stat-grid' ? skeletonVariant : 'default'"
      />
      <AppVenusSpinner v-if="inline" size="sm" :label="label" class="mt-4" />
    </slot>
  </div>
  <p v-else-if="errorMessage" class="tail-alert-error">
    {{ errorMessage }}
  </p>
  <p v-else-if="empty && !pending" class="tail-card text-sm font-medium text-brand-gray-500">
    <slot name="empty">{{ t('common.empty') }}</slot>
  </p>
  <div
    v-else-if="showContent"
    class="relative"
    :class="[
      pending ? '' : 'tail-page-enter',
      pending ? 'pointer-events-none opacity-60' : '',
    ]"
    :aria-busy="pending ? 'true' : undefined"
  >
    <slot />
    <div
      v-if="pending"
      class="pointer-events-none absolute inset-0 flex items-start justify-center pt-8"
      aria-hidden="true"
    >
      <AppVenusSpinner v-if="inline" size="sm" :label="label" />
    </div>
  </div>
</template>
