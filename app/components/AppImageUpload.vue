<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  guest?: boolean
  placeholder?: string
  /** Open Telegram-style circular crop before upload (profile avatars). */
  crop?: boolean
}>(), {
  modelValue: '',
  label: '',
  guest: false,
  placeholder: '/placeholders/coach.svg',
  crop: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
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
const broken = ref(false)
const cropOpen = ref(false)
const cropSourceUrl = ref('')

watch(() => props.modelValue, () => {
  broken.value = false
})

const previewSrc = computed(() => {
  if (props.modelValue && !broken.value) return props.modelValue
  return props.placeholder
})

function openFilePicker() {
  inputRef.value?.click()
}

function revokeCropSource() {
  if (cropSourceUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(cropSourceUrl.value)
  }
  cropSourceUrl.value = ''
}

function closeCrop() {
  cropOpen.value = false
  revokeCropSource()
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  if (props.crop) {
    revokeCropSource()
    cropSourceUrl.value = URL.createObjectURL(file)
    cropOpen.value = true
    return
  }

  const result = await upload(file)
  if (result?.url) emit('update:modelValue', result.url)
}

async function onCropConfirm(file: File) {
  closeCrop()
  const result = await upload(file)
  if (result?.url) emit('update:modelValue', result.url)
}

onUnmounted(() => {
  revokeCropSource()
})
</script>

<template>
  <div class="space-y-2">
    <p v-if="label" class="text-sm font-bold">{{ label }}</p>
    <div class="relative flex items-center gap-3">
      <img :src="previewSrc" alt="" class="h-20 w-20 border border-brand-gray-100 object-cover shadow-venus-sm" @error="broken = true">
      <div class="flex flex-col gap-2">
        <button type="button" class="btn-secondary text-sm" :disabled="uploading" @click="askPick(openFilePicker)">
          {{ uploading ? t('upload.uploading') : t('upload.choose') }}
        </button>
        <button v-if="modelValue" type="button" class="text-xs font-bold text-brand-gray-600" @click="emit('update:modelValue', '')">
          {{ t('upload.remove') }}
        </button>
      </div>
      <input
        ref="inputRef"
        type="file"
        :accept="accept"
        class="absolute h-px w-px overflow-hidden opacity-0"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChange"
      >
    </div>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <AppUploadSheets
      :failure-open="showFailure"
      :failure-message="error"
      @close-failure="dismissFailure"
    />
    <AppAvatarCropSheet
      :open="cropOpen"
      :source-url="cropSourceUrl"
      @close="closeCrop"
      @confirm="onCropConfirm"
    />
  </div>
</template>
