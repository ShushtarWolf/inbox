<script setup lang="ts">
/** Keep the fold spinner on screen long enough to read (animation cycle is 1.8s). */
const MIN_LOADING_MS = 550

const props = withDefaults(defineProps<{
  pending?: boolean
  /** Accept Error objects from useFetch/useAsyncData without callers wrapping. */
  error?: boolean | string | Error | null
  empty?: boolean
  loadingLabel?: string
  /** @deprecated Skeletons replaced by folding-cube spinner; kept for call-site compat. */
  skeletonLines?: number
  /** @deprecated Skeletons replaced by folding-cube spinner; kept for call-site compat. */
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
 * during soft refreshes (pending flips true). Avoids content height cliffs that
 * drive Clarity CLS on /coaches, athlete home, owner calendar, etc.
 */
const retainContent = ref(false)

/** Pending with a minimum on-screen hold so fast fetches still show the spinner. */
const displayPending = ref(false)
let loadingShownAt = 0
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function releaseLoading() {
  clearHideTimer()
  displayPending.value = false
}

watch(
  () => props.pending,
  (pending) => {
    clearHideTimer()
    if (pending) {
      if (!displayPending.value) {
        loadingShownAt = Date.now()
      }
      displayPending.value = true
      return
    }
    // Surface errors immediately — do not hold the spinner over a failure.
    if (errorMessage.value) {
      releaseLoading()
      return
    }
    const elapsed = loadingShownAt ? Date.now() - loadingShownAt : MIN_LOADING_MS
    const remaining = MIN_LOADING_MS - elapsed
    if (remaining <= 0) {
      releaseLoading()
      return
    }
    hideTimer = setTimeout(() => {
      hideTimer = null
      displayPending.value = false
    }, remaining)
  },
  { immediate: true },
)

watch(errorMessage, (msg) => {
  if (msg) releaseLoading()
})

onUnmounted(clearHideTimer)

watch(
  () => [displayPending.value, props.error, props.empty] as const,
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

const showLoading = computed(() => displayPending.value && !retainContent.value)
const showContent = computed(() => {
  if (errorMessage.value) return false
  if (showLoading.value) return false
  if (props.empty && !displayPending.value) return false
  return true
})
</script>

<template>
  <div v-if="showLoading" :class="inline ? '' : 'tail-page-enter'">
    <slot name="loading">
      <AppVenusSpinner :size="inline ? 'sm' : 'md'" :label="label" />
    </slot>
  </div>
  <p v-else-if="errorMessage" class="tail-alert-error">
    {{ errorMessage }}
  </p>
  <p v-else-if="empty && !displayPending" class="tail-card text-sm font-medium text-brand-gray-500">
    <slot name="empty">{{ t('common.empty') }}</slot>
  </p>
  <div
    v-else-if="showContent"
    class="relative"
    :class="[
      displayPending ? '' : 'tail-page-enter',
      displayPending ? 'pointer-events-none opacity-60' : '',
    ]"
    :aria-busy="displayPending ? 'true' : undefined"
  >
    <slot />
    <div
      v-if="displayPending"
      class="pointer-events-none absolute inset-0 flex items-start justify-center pt-8"
      aria-hidden="true"
    >
      <AppVenusSpinner size="sm" compact />
    </div>
  </div>
</template>
