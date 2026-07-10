<script setup lang="ts">
const props = withDefaults(defineProps<{
  to: string
  name: string
  avatarUrl?: string | null
  initials: string
  compact?: boolean
}>(), {
  avatarUrl: null,
  compact: false,
})

const { t } = useI18n()
const showPhoto = ref(!!props.avatarUrl)

watch(() => props.avatarUrl, (url) => {
  showPhoto.value = !!url
})

function onPhotoError() {
  showPhoto.value = false
}
</script>

<template>
  <NuxtLink
    :to="to"
    class="inline-flex max-w-full items-center gap-2 rounded-brutal border-2 border-black bg-white py-1 pe-3 ps-1 shadow-brutal-sm transition hover:-translate-y-0.5 hover:shadow-brutal"
    :title="name"
    :aria-label="t('nav.me')"
  >
    <img
      v-if="avatarUrl && showPhoto"
      :src="avatarUrl"
      alt=""
      class="h-8 w-8 shrink-0 border-2 border-black object-cover"
      @error="onPhotoError"
    >
    <span
      v-else
      class="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-brand-accent text-xs font-black text-black"
      aria-hidden="true"
    >
      {{ initials }}
    </span>
    <span v-if="!compact" class="min-w-0 truncate text-sm font-black text-black">{{ name }}</span>
  </NuxtLink>
</template>
