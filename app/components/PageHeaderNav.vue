<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  homeTo?: string
  backTo?: string
}>(), {
  subtitle: '',
  homeTo: '/',
  backTo: '',
})

const { t } = useI18n()
const router = useRouter()

function goBack() {
  if (props.backTo) {
    return navigateTo(props.backTo)
  }

  if (window.history.length > 1) {
    router.back()
    return
  }

  navigateTo(props.homeTo)
}
</script>

<template>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h1 class="font-display text-xl font-black">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-brand-gray-600">{{ subtitle }}</p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">
        {{ t('common.back') }}
      </button>
      <NuxtLink :to="homeTo" class="btn-ghost px-3 py-2 text-xs">
        {{ t('nav.home') }}
      </NuxtLink>
    </div>
  </div>
</template>
