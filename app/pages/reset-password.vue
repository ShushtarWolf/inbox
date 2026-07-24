<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const localePath = useLocalePath()
const { openLogin } = useAuthFlow()

onMounted(async () => {
  openLogin()
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
