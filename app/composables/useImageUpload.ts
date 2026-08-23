import {
  classifyImageUploadFile,
  IMAGE_UPLOAD_ACCEPT,
  isHeicLikeFile,
  type ImageUploadRejectReason,
} from '#shared/imageUpload.ts'
import { prepareImageForUpload } from '#shared/prepareImageUpload.ts'

function isFetchError(err: unknown): err is {
  statusCode?: number
  statusMessage?: string
  data?: { statusMessage?: string; message?: string }
  message?: string
} {
  return Boolean(err && typeof err === 'object')
}

export function useImageUpload(options?: { guest?: boolean }) {
  const { t } = useI18n()
  const uploading = ref(false)
  const error = ref('')
  const showFailure = ref(false)

  function rejectMessage(reason: ImageUploadRejectReason) {
    switch (reason) {
      case 'heic': return t('upload.errorHeic')
      case 'type': return t('upload.errorType')
      case 'size': return t('upload.errorSize')
      case 'empty': return t('upload.errorEmpty')
      default: return t('upload.failed')
    }
  }

  function mapServerError(err: unknown) {
    if (!isFetchError(err)) return t('upload.failed')
    const status = err.statusCode
    const raw = `${err.statusMessage || ''} ${err.data?.statusMessage || ''} ${err.data?.message || ''} ${err.message || ''}`.toLowerCase()

    if (status === 401 || status === 403) return t('upload.errorAuth')
    if (status === 429) return t('upload.errorRateLimit')
    if (raw.includes('heic') || raw.includes('heif')) return t('upload.errorHeic')
    if (raw.includes('5 mb') || raw.includes('smaller') || raw.includes('too large')) return t('upload.errorSize')
    if (
      raw.includes('jpeg')
      || raw.includes('png')
      || raw.includes('webp')
      || raw.includes('only')
      || raw.includes('allowed')
      || raw.includes('unsupported')
    ) {
      return t('upload.errorType')
    }
    if (raw.includes('no file')) return t('upload.errorEmpty')
    return t('upload.failed')
  }

  /** Open the native file picker in the same user gesture — never defer behind a modal. */
  function askPick(openFilePicker: () => void) {
    if (uploading.value) return
    error.value = ''
    showFailure.value = false
    openFilePicker()
  }

  function dismissFailure() {
    showFailure.value = false
  }

  function fail(message: string) {
    error.value = message
    showFailure.value = true
  }

  /** Ensure the returned URL actually loads — catch Nitro/static path mismatches early. */
  async function assertImageLoads(url: string) {
    if (!import.meta.client) return
    const probe = url.includes('?') ? `${url}&_=${Date.now()}` : `${url}?_=${Date.now()}`
    const res = await fetch(probe, { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) throw new Error('load')
    const type = (res.headers.get('content-type') || '').toLowerCase()
    if (type && !type.startsWith('image/') && !type.includes('octet-stream')) {
      throw new Error('load')
    }
  }

  async function upload(file: File) {
    uploading.value = true
    error.value = ''
    showFailure.value = false
    try {
      const reason = classifyImageUploadFile(file)
      if (reason) {
        fail(rejectMessage(reason))
        return null
      }
      let prepared: File
      try {
        prepared = await prepareImageForUpload(file)
      } catch {
        fail(isHeicLikeFile(file) ? t('upload.errorHeic') : t('upload.failed'))
        return null
      }
      const form = new FormData()
      form.append('file', prepared)
      const endpoint = options?.guest ? '/api/uploads/guest' : '/api/uploads'
      const result = await $fetch<{ url: string }>(endpoint, { method: 'POST', body: form })
      if (!result?.url) {
        fail(t('upload.failed'))
        return null
      }
      try {
        await assertImageLoads(result.url)
      } catch {
        fail(t('upload.errorLoad'))
        return null
      }
      return result
    } catch (err) {
      fail(mapServerError(err))
      return null
    } finally {
      uploading.value = false
    }
  }

  return {
    uploading,
    error,
    showFailure,
    accept: IMAGE_UPLOAD_ACCEPT,
    askPick,
    dismissFailure,
    upload,
  }
}
