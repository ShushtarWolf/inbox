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
  <div class="venus-page-header">
    <div class="min-w-0">
      <h1 class="venus-page-title">{{ title }}</h1>
      <p v-if="subtitle" class="venus-page-subtitle"><bdi dir="ltr" class="tabular-nums">{{ subtitle }}</bdi></p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">
        <span class="inline-flex items-center gap-1.5">
          <AppIcon name="arrow_back" size="sm" />
          {{ t('common.back') }}
        </span>
      </button>
      <NuxtLink :to="homeTo" class="btn-ghost px-3 py-2 text-xs">
        <span class="inline-flex items-center gap-1.5">
          <AppIcon name="home" size="sm" />
          {{ t('nav.home') }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
