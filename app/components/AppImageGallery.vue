<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string[]
  label?: string
  guest?: boolean
  max?: number
}>(), {
  modelValue: () => [],
  label: '',
  guest: false,
  max: 8,
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const { t } = useI18n()
const {
  uploading,
  error,
  showFailure,
  accept,
  askPick,
  dismissFailure,
  upload,
} = useImageUpload({ guest: props.guest })
const inputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  inputRef.value?.click()
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (!files.length) return
  const next = [...props.modelValue]
  for (const file of files) {
    if (next.length >= props.max) break
    const result = await upload(file)
    if (result?.url) next.push(result.url)
  }
  emit('update:modelValue', next)
  target.value = ''
}

function removeAt(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="label" class="text-sm font-bold">{{ label }}</p>
    <div class="flex flex-wrap gap-2">
      <img
        v-for="(url, index) in modelValue"
        :key="`${url}-${index}`"
        :src="url"
        alt=""
        class="h-20 w-20 border border-brand-gray-100 object-cover shadow-venus-sm"
      />
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="btn-secondary text-sm"
        :disabled="uploading || modelValue.length >= max"
        @click="askPick(openFilePicker)"
      >
        {{ uploading ? t('upload.uploading') : t('upload.addPhoto') }}
      </button>
      <button
        v-if="modelValue.length"
        type="button"
        class="text-xs font-bold text-brand-gray-600"
        @click="emit('update:modelValue', [])"
      >
        {{ t('upload.clearAll') }}
      </button>
    </div>
    <div v-if="modelValue.length" class="flex flex-wrap gap-2">
      <button
        v-for="(url, index) in modelValue"
        :key="`remove-${url}-${index}`"
        type="button"
        class="text-xs text-red-600"
        @click="removeAt(index)"
      >
        {{ t('upload.remove') }} {{ index + 1 }}
      </button>
    </div>
    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      multiple
      class="absolute h-px w-px overflow-hidden opacity-0"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <AppUploadSheets
      :failure-open="showFailure"
      :failure-message="error"
      @close-failure="dismissFailure"
    />
  </div>
</template>
