<script setup lang="ts">
const isNavigating = ref(false)
const router = useRouter()

router.beforeEach((to, from) => {
  // Skip initial hydration — content is already painted; holding would only delay it.
  if (!from.matched.length) return
  isNavigating.value = true
})

router.afterEach(() => {
  isNavigating.value = false
})

router.onError(() => {
  isNavigating.value = false
})

const showRouteLoading = useHeldPending(isNavigating)
</script>

<template>
  <div v-if="showRouteLoading" class="venus-route-progress" aria-hidden="true">
    <div class="venus-route-progress-bar" />
  </div>
  <div
    v-if="showRouteLoading"
    class="pointer-events-none fixed inset-0 z-[99] flex items-center justify-center bg-brand-cream/40"
    aria-hidden="true"
  >
    <AppVenusSpinner size="md" compact />
  </div>
</template>
