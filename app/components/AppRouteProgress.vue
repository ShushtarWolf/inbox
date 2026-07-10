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
</template>
