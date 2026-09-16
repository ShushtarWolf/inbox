<script setup lang="ts">
const isNavigating = ref(false)
const router = useRouter()

router.beforeEach(() => {
  isNavigating.value = true
})

router.afterEach(() => {
  isNavigating.value = false
})

router.onError(() => {
  isNavigating.value = false
})
</script>

<template>
  <div v-if="isNavigating" class="venus-route-progress" aria-hidden="true">
    <div class="venus-route-progress-bar" />
  </div>
  <div
    v-if="isNavigating"
    class="pointer-events-none fixed inset-0 z-[99] flex items-center justify-center bg-brand-cream/40"
    aria-hidden="true"
  >
    <AppVenusSpinner size="md" compact />
  </div>
</template>
