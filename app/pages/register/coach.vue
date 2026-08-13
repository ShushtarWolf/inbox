<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const localePath = useLocalePath()
const { openRegister } = useAuthFlow()

onMounted(async () => {
  openRegister({ role: 'COACH' })
  await navigateTo(localePath('/'))
})
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
