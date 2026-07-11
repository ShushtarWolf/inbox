export function useImageUpload(options?: { guest?: boolean }) {
  const { t } = useI18n()
  const uploading = ref(false)
  const error = ref('')

  async function upload(file: File) {
    uploading.value = true
    error.value = ''
    try {
      const form = new FormData()
      form.append('file', file)
      const endpoint = options?.guest ? '/api/uploads/guest' : '/api/uploads'
      return await $fetch<{ url: string }>(endpoint, { method: 'POST', body: form })
    } catch {
      error.value = t('upload.failed')
      return null
    } finally {
      uploading.value = false
    }
  }

  return { uploading, error, upload }
}
