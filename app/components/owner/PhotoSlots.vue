<script setup lang="ts">
/**
 * Canva 4-slot photo grid (settings / add-court): square dashed tiles + min-size hint.
 */
const props = withDefaults(defineProps<{
  modelValue?: string[]
  max?: number
  hint?: string
}>(), {
  modelValue: () => [],
  max: 4,
  hint: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t } = useI18n()
const { uploading, error, upload } = useImageUpload()
const inputRef = ref<HTMLInputElement | null>(null)
const activeSlot = ref<number | null>(null)

const slots = computed(() => {
  const list = [...(props.modelValue || [])]
  while (list.length < props.max) list.push('')
  return list.slice(0, props.max)
})

function openSlot(index: number) {
  activeSlot.value = index
  inputRef.value?.click()
}

function clearSlot(index: number) {
  const next = [...slots.value]
  next[index] = ''
  emit('update:modelValue', next.filter(Boolean))
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  const index = activeSlot.value
  target.value = ''
  activeSlot.value = null
  if (!file || index == null) return
  const result = await upload(file)
  if (!result?.url) return
  const next = [...slots.value]
  next[index] = result.url
  emit('update:modelValue', next.filter(Boolean))
}
</script>

<template>
  <div class="canva-photo-slots-wrap">
    <div class="canva-photo-slots" role="list">
      <button
        v-for="(url, index) in slots"
        :key="index"
        type="button"
        class="canva-photo-slot"
        role="listitem"
        :aria-label="url ? t('upload.remove') : t('upload.addPhoto')"
        :disabled="uploading"
        @click="url ? clearSlot(index) : openSlot(index)"
      >
        <img v-if="url" :src="url" alt="" class="canva-photo-slot-media" />
        <template v-else>
          <AppIcon name="image" size="md" class="text-brand-gray-400" />
          <span class="canva-photo-slot-plus" aria-hidden="true">+</span>
        </template>
      </button>
    </div>
    <p class="canva-photo-slots-hint">{{ hint || t('owner.settingsPage.minUploadHint') }}</p>
    <p v-if="uploading" class="text-xs text-brand-gray-600">{{ t('upload.uploading') }}</p>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <input
      ref="inputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="onFileChange"
    >
  </div>
</template>
