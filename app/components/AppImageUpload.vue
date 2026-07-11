<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  guest?: boolean
  placeholder?: string
}>(), {
  modelValue: '',
  label: '',
  guest: false,
  placeholder: '/placeholders/coach.svg',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const { uploading, error, upload } = useImageUpload({ guest: props.guest })
const inputRef = ref<HTMLInputElement | null>(null)

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const result = await upload(file)
  if (result?.url) emit('update:modelValue', result.url)
  target.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="label" class="text-sm font-bold">{{ label }}</p>
    <div class="flex items-center gap-3">
      <img :src="modelValue || placeholder" alt="" class="h-20 w-20 border border-brand-gray-100 object-cover shadow-venus-sm" />
      <div class="flex flex-col gap-2">
        <button type="button" class="btn-secondary text-sm" :disabled="uploading" @click="inputRef?.click()">
          {{ uploading ? t('upload.uploading') : t('upload.choose') }}
        </button>
        <button v-if="modelValue" type="button" class="text-xs font-bold text-brand-gray-600" @click="emit('update:modelValue', '')">
          {{ t('upload.remove') }}
        </button>
      </div>
      <input ref="inputRef" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onFileChange" />
    </div>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
  </div>
</template>
