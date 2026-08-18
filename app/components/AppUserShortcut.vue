<script setup lang="ts">
const props = withDefaults(defineProps<{
  to?: string
  name: string
  avatarUrl?: string | null
  initials: string
  compact?: boolean
  expanded?: boolean | null
}>(), {
  to: '',
  avatarUrl: null,
  compact: false,
  expanded: null,
})

const emit = defineEmits<{ click: [] }>()
const isButton = computed(() => !props.to)

const { t } = useI18n()
const showPhoto = ref(!!props.avatarUrl)

watch(() => props.avatarUrl, (url) => {
  showPhoto.value = !!url
})

function onPhotoError() {
  showPhoto.value = false
}

const shortcutClass = 'inline-flex max-w-full items-center gap-2 rounded-full border border-brand-gray-200 bg-white py-1 pe-3 ps-1 shadow-venus-sm transition hover:border-brand-primary/30 hover:shadow-venus'
</script>

<template>
  <button
    v-if="isButton"
    type="button"
    :class="shortcutClass"
    :title="name"
    :aria-label="t('nav.me')"
    :aria-expanded="expanded === null ? undefined : expanded"
    aria-haspopup="dialog"
    @click="emit('click')"
  >
    <img
      v-if="avatarUrl && showPhoto"
      :src="avatarUrl"
      alt=""
      class="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white"
      @error="onPhotoError"
    >
    <span
      v-else
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white"
      aria-hidden="true"
    >
      {{ initials }}
    </span>
    <span v-if="!compact" class="min-w-0 truncate text-sm font-semibold text-brand-navy">{{ name }}</span>
  </button>
  <NuxtLink
    v-else
    :to="to"
    :class="shortcutClass"
    :title="name"
    :aria-label="t('nav.me')"
  >
    <img
      v-if="avatarUrl && showPhoto"
      :src="avatarUrl"
      alt=""
      class="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white"
      @error="onPhotoError"
    >
    <span
      v-else
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white"
      aria-hidden="true"
    >
      {{ initials }}
    </span>
    <span v-if="!compact" class="min-w-0 truncate text-sm font-semibold text-brand-navy">{{ name }}</span>
  </NuxtLink>
</template>
